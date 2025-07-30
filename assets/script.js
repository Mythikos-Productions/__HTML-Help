document.addEventListener("DOMContentLoaded", function () {
    loadSidebar();
});

// ! Function to dynamically load sidebar.html into the page
function loadSidebar() {
    fetch('sidebar.html')
        .then(response => response.text()) // ! Fetch sidebar content
        .then(data => {
            document.getElementById('sidebar-container').innerHTML = data; // ! Insert into placeholder
            attachSidebarEventListeners(); // ! Reattach event listeners after loading
        })
        .catch(error => console.error('Error loading sidebar:', error)); // ! Handle errors
}

// ! Reattach event listeners after loading sidebar
function attachSidebarEventListeners() {
    const tocLinks = document.querySelectorAll('.sidebar ul li > a'); // ! Get all anchor links in the TOC
    tocLinks.forEach(link => {
        // ! Add click event to toggle submenu visibility
        link.addEventListener('click', toggleSubmenu);
    });

    // Attach search event listener
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(searchTopics, 300));
    }
}

// ! Function to toggle submenus in the table of contents on click
function toggleSubmenu(event) {
    let submenu = event.target.nextElementSibling; // ! Get the submenu
    if (submenu && submenu.tagName === 'UL') { // ! Check if it's a submenu
        submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block'; // ! Toggle display
    }
}

// Debounce function to limit how often a function is called.
function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// List of topics with names and links. Their content will be fetched on demand.
const topics = [
  { name: 'General', link: 'general.html' },
  { name: 'SP Tools', link: 'tools.html' },
  { name: 'File Structure', link: 'file-structure.html' },
  { name: 'File Import Order', link: 'file-order.html' },
  { name: 'Framework Essentials', link: 'essentials.html' },
  { name: 'GUI Design Principles', link: 'gui-design.html' },
  { name: 'Boot Agent', link: 'boot-agent.html' },
  { name: 'Configuration Files', link: 'configuration-files.html' },
  { name: 'Device Configuration', link: 'configuration-files.html#device-config' },
  { name: 'Matrix Configuration', link: 'configuration-files.html#matrix-config' },
  { name: 'What is a Sandbox?', link: 'sandbox.html' },
  { name: 'Defining a Sandbox', link: 'defining-a-sandbox.html' },
  { name: 'Sandbox Config', link: 'sandbox-config.html' },
  { name: 'Creating Elements', link: 'example-creating-elements.html' },
  { name: 'Host Management', link: 'host_management.html' }
];

// Cache for storing fetched page content (raw HTML) to avoid repeated network calls.
const pageCache = {};

// Triggered by user action to perform a search.
function searchTopics() {
  const input = document.getElementById('search');
  const query = input.value.trim().toLowerCase();
  if (!query) {
    displayResults([]);
    return;
  }

  // Show a loading indicator
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'search-loading-indicator';
  loadingIndicator.textContent = 'Searching...';
  loadingIndicator.style.position = 'fixed';
  loadingIndicator.style.top = '50%';
  loadingIndicator.style.left = '50%';
  loadingIndicator.style.transform = 'translate(-50%, -50%)';
  loadingIndicator.style.backgroundColor = 'white';
  loadingIndicator.style.padding = '20px';
  loadingIndicator.style.borderRadius = '5px';
  loadingIndicator.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
  loadingIndicator.style.zIndex = '1000';
  document.body.appendChild(loadingIndicator);

  // For each topic, fetch its page on demand.
  const fetchPromises = topics.map(topic => {
    // Extract the base filename without any hash fragment
    const baseLink = topic.link.split('#')[0];

    if (pageCache[baseLink]) {
      return Promise.resolve(checkAndGenerateResult(topic, pageCache[baseLink], query));
    } else {
      return fetch(baseLink)
        .then(response => {
          if (!response.ok) {
            // If the page doesn't exist, just check if the topic name matches the query
            if (topic.name.toLowerCase().includes(query)) {
              return { 
                ...topic, 
                title: topic.name, 
                snippet: 'Page content not available, but title matches search query.', 
                id: '' 
              };
            }
            throw new Error(`Failed to load ${baseLink}`);
          }
          return response.text();
        })
        .then(text => {
          if (typeof text === 'string') {
            pageCache[baseLink] = text; // cache the raw HTML
            return checkAndGenerateResult(topic, text, query);
          }
          return text; // This is already a result object from the error handler
        })
        .catch(error => {
          console.error("Error fetching", baseLink, error);
          // Still include the topic in results if its name matches the query
          if (topic.name.toLowerCase().includes(query)) {
            return { 
              ...topic, 
              title: topic.name, 
              snippet: 'Page content not available, but title matches search query.', 
              id: '' 
            };
          }
          return null;
        });
    }
  });

  Promise.all(fetchPromises).then(resultsArray => {
    // Remove the loading indicator
    const loadingIndicator = document.getElementById('search-loading-indicator');
    if (loadingIndicator) {
      document.body.removeChild(loadingIndicator);
    }

    const filteredResults = resultsArray.filter(result => result !== null);
    displayResults(filteredResults);
  }).catch(error => {
    console.error("Error in search:", error);

    // Remove the loading indicator
    const loadingIndicator = document.getElementById('search-loading-indicator');
    if (loadingIndicator) {
      document.body.removeChild(loadingIndicator);
    }

    // Display an error message
    displayResults([]);
  });
}

// Checks if the topic matches the search query either via its name or its page content.
// If matched, extracts an element (h2 or h3) that bears an id and whose text contains the query.
function checkAndGenerateResult(topic, content, query) {
  const lowerContent = content.toLowerCase();
  const nameMatch = topic.name.toLowerCase().includes(query);
  const contentMatch = lowerContent.includes(query);

  if (nameMatch || contentMatch) {
    const { title, snippet, id } = extractResultSnippet(content, query);
    return {
      ...topic,
      title: title || topic.name, // fallback to topic name if nothing else is matched
      snippet: snippet || '',
      id: id || '' // the id to be used for the hash fragment.
    };
  }
  return null;
}

// Uses DOMParser to convert HTML into a document and then searches for h2 or h3 elements that have an id.
// If an element's text includes the query, returns its title, a snippet, and its id.
function extractResultSnippet(htmlContent, query) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");

  // Search for all h2 and h3 elements that have an id.
  const elements = doc.querySelectorAll('h2[id], h3[id]');
  for (let el of elements) {
    if (el.textContent.toLowerCase().includes(query)) {
      const title = el.textContent.trim();
      let snippet = '';

      // Try using the next sibling if it is a paragraph.
      const sibling = el.nextElementSibling;
      if (sibling && sibling.tagName.toLowerCase() === 'p') {
        snippet = sibling.textContent.trim();
      } else if (el.parentElement) {
        // Fallback: use the parent's text content.
        snippet = el.parentElement.textContent.trim();
      }

      const id = el.getAttribute('id');
      return { title, snippet, id };
    }
  }
  // If no matching element is found, return empty values.
  return { title: '', snippet: '', id: '' };
}

// Displays search results in a modal overlay as a clickable list.
function displayResults(results) {
  // Remove any existing search results modal
  let existingModal = document.getElementById('search-results-modal');
  if (existingModal) {
    document.body.removeChild(existingModal);
  }

  // Create a new modal for search results
  const modal = document.createElement('div');
  modal.id = 'search-results-modal';
  modal.style.position = 'fixed';
  modal.style.top = '50%';
  modal.style.left = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.backgroundColor = 'white';
  modal.style.padding = '20px';
  modal.style.borderRadius = '5px';
  modal.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
  modal.style.zIndex = '1000';
  modal.style.maxWidth = '80%';
  modal.style.maxHeight = '80%';
  modal.style.overflow = 'auto';

  // Add a close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'X';
  closeButton.style.position = 'absolute';
  closeButton.style.top = '10px';
  closeButton.style.right = '10px';
  closeButton.style.border = 'none';
  closeButton.style.background = 'none';
  closeButton.style.fontSize = '20px';
  closeButton.style.cursor = 'pointer';
  closeButton.onclick = function() {
    document.body.removeChild(modal);
  };
  modal.appendChild(closeButton);

  // Add search results content
  const content = document.createElement('div');
  if (results.length === 0) {
    content.innerHTML = '<p>No results found.</p>';
  } else {
    let resultsHtml = '<h2>Search Results:</h2><ul>';
    results.forEach(result => {
      const href = result.id ? `${result.link}#${result.id}` : result.link;
      resultsHtml += `<li>
        <a href="${href}" class="redirect-link">${result.title}</a>
        ${result.snippet ? `<p>${result.snippet}</p>` : ''}
      </li>`;
    });
    resultsHtml += '</ul>';
    content.innerHTML = resultsHtml;
  }
  modal.appendChild(content);

  // Add a semi-transparent overlay behind the modal
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  overlay.style.zIndex = '999';
  overlay.onclick = function() {
    document.body.removeChild(overlay);
    document.body.removeChild(modal);
  };

  // Add the overlay and modal to the document
  document.body.appendChild(overlay);
  document.body.appendChild(modal);

  // Attach click event listeners to the links
  const links = modal.querySelectorAll('a.redirect-link');
  links.forEach(link => {
    link.addEventListener('click', function(event) {
      event.preventDefault();
      window.location.href = this.href;
      document.body.removeChild(overlay);
      document.body.removeChild(modal);
    });
  });
}
