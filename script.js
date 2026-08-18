const omdbKey = "a8ec091b";
const tmdbKey = "2d1e85984a53ca91efbf0a4fd3650ef9";

// DOM Elements
const sidebar = document.getElementById("sidebar");
const searchInput = document.getElementById("titleInput");
const searchBtn = document.getElementById("searchBtn");
const autocompleteDiv = document.getElementById("autocomplete");
const heroSection = document.getElementById("hero");
const searchSection = document.getElementById("searchSection");
const searchCarousel = document.getElementById("searchCarousel");
const continueCarousel = document.getElementById("continueCarousel");
const recommendedCarousel = document.getElementById("recommendedCarousel"); 
const genreSelect = document.getElementById("genreSelect"); // New Interactive Dropdown
const favoritesCarousel = document.getElementById("favoritesCarousel");
const recentCarousel = document.getElementById("recentCarousel");
const detailsModal = document.getElementById("detailsModal");
const modalDetailsBody = document.getElementById("modalDetailsBody");
const playerModal = document.getElementById("playerModal");
const playerContainer = document.getElementById("playerContainer");

let currentMedia = { imdbID: "", type: "", season: 1, episode: 1 };
let topUserGenre = "-"; 

// TMDB Genre Mapping
const tmdbGenreMap = {
    "Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35, "Crime": 80,
    "Documentary": 99, "Drama": 18, "Family": 10751, "Fantasy": 14, "History": 36,
    "Horror": 27, "Music": 10402, "Mystery": 9648, "Romance": 10749, "Sci-Fi": 878,
    "TV Movie": 10770, "Thriller": 53, "War": 10752, "Western": 37
};

// --- Local Data Caching System ---
const cacheKey = "omdb_cache";
function getCache() { return JSON.parse(localStorage.getItem(cacheKey) || "{}"); }
function setCache(dataMap) { localStorage.setItem(cacheKey, JSON.stringify(dataMap)); }

async function fetchWithCache(url, idKey = null) {
  const cache = getCache();
  if (idKey && cache[idKey]) return cache[idKey].data;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.Response !== "False" && !data.success_false && idKey) {
      cache[idKey] = { data: data, ts: Date.now() };
      setCache(cache);
    }
    return data;
  } catch (e) {
    console.error("Fetch error:", e);
    return { Response: "False", Error: e.message };
  }
}

// Storage Utils
const getList = key => JSON.parse(localStorage.getItem(key) || "[]");
const saveList = (key, val) => { localStorage.setItem(key, JSON.stringify(val)); renderAnalytics(); }

// Event Listeners
document.getElementById("sidebarToggle").addEventListener("click", () => sidebar.classList.toggle("show"));
searchBtn.addEventListener("click", executeSearch);
searchInput.addEventListener("input", showAutocomplete);
document.addEventListener("click", e => { if (!e.target.closest('.search-container')) autocompleteDiv.style.display = "none"; });
document.getElementById("filterType").addEventListener("change", executeSearch);

// Initialization
window.addEventListener("DOMContentLoaded", async () => {
  setupGenreDropdown(); // Setup the interactive dropdown options
  renderAnalytics();    // Calculates topUserGenre based on history
  loadHero();
  loadCarousels();
  loadRecommendations(); // Fetches based on topUserGenre initially
});

// --- NEW: Interactive TMDB Recommendation Engine ---
function setupGenreDropdown() {
    // Populate the dropdown with "Trending" and all TMDB genres
    let options = `<option value="trending">Trending Now</option>`;
    
    // Sort genres alphabetically for the dropdown
    const sortedGenres = Object.keys(tmdbGenreMap).sort();
    sortedGenres.forEach(genre => {
        options += `<option value="${genre}">${genre}</option>`;
    });
    
    genreSelect.innerHTML = options;
    
    // Listen for manual genre changes by the user
    genreSelect.addEventListener("change", (e) => {
        loadRecommendations(e.target.value);
    });
}

async function loadRecommendations(forcedGenre = null) {
  // Determine which genre to load (User explicitly picked vs Analytics top genre)
  let targetGenre = forcedGenre || topUserGenre;
  
  // If user has no history and didn't force a genre, default to trending
  if ((targetGenre === "-" || targetGenre === "N/A") && !forcedGenre) {
      targetGenre = "trending";
  }

  // Ensure the UI dropdown matches what is currently loading
  genreSelect.value = targetGenre;

  showSkeletons(recommendedCarousel, 10);

  if (targetGenre === "trending") {
      const res = await fetchWithCache(`https://api.themoviedb.org/3/trending/all/week?api_key=${tmdbKey}`, 'tmdb_trending');
      renderTMDBDeck(res.results);
  } else {
      const genreId = tmdbGenreMap[targetGenre];
      if (genreId) {
        // Discover movies by specific genre ID
        const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&with_genres=${genreId}&sort_by=popularity.desc`).then(r => r.json());
        renderTMDBDeck(res.results);
      } else {
        recommendedCarousel.innerHTML = "<p style='padding:1rem;'>Select a genre above to see recommendations.</p>";
      }
  }
}

async function renderTMDBDeck(tmdbResults) {
    if(!tmdbResults || tmdbResults.length === 0) return;
    
    recommendedCarousel.innerHTML = "";
    
    for (const item of tmdbResults.slice(0, 15)) {
        if(!item.poster_path) continue; 
        
        const posterUrl = `https://image.tmdb.org/t/p/w342${item.poster_path}`;
        const title = item.title || item.name;
        const year = item.release_date ? item.release_date.substring(0,4) : (item.first_air_date ? item.first_air_date.substring(0,4) : "");

        const card = document.createElement("div");
        card.className = "result-card tmdb-card";
        card.tabIndex = 0;
        card.dataset.tmdbtitle = title; 
        
        card.innerHTML = `
        <img src="${posterUrl}" loading="lazy" alt="${title}">
        <div class="card-overlay">
            <div class="play-icon">▶</div>
            <h4>${title}</h4>
            <p>${year}</p>
        </div>
        `;
        
        card.onclick = async () => {
             modalDetailsBody.innerHTML = '<div style="text-align:center;width:100%;"><p>Bridging databases...</p></div>';
             detailsModal.style.display = "flex";
             
             const bridgeData = await fetchWithCache(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${year}&apikey=${omdbKey}`);
             
             if(bridgeData.Response !== "False") {
                 loadDetails(bridgeData.imdbID);
             } else {
                 const looseBridge = await fetchWithCache(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${omdbKey}`);
                 if(looseBridge.Response !== "False") {
                     loadDetails(looseBridge.imdbID);
                 } else {
                     modalDetailsBody.innerHTML = `<div style="text-align:center;width:100%;color:red;">Could not find streaming source for ${title}</div>`;
                 }
             }
        };
        recommendedCarousel.appendChild(card);
    }
}


// --- Hero Billboard ---
async function loadHero() {
  const favs = getList("favorites");
  const recents = getList("recent");
  let heroId = "tt0133093"; 

  if (favs.length > 0) heroId = favs[Math.floor(Math.random() * favs.length)].imdbID;
  else if (recents.length > 0) heroId = recents[0];

  const data = await fetchWithCache(`https://www.omdbapi.com/?i=${heroId}&plot=full&apikey=${omdbKey}`, heroId);
  if(data.Response === "False") return;

  document.getElementById("heroTitle").textContent = data.Title;
  document.getElementById("heroPlot").textContent = data.Plot;
  document.getElementById("heroMeta").innerHTML = `<span>${data.Rated}</span> <span>${data.Year}</span> <span>⭐ ${data.imdbRating}</span>`;
  
  const posterUrl = data.Poster !== "N/A" ? data.Poster : "https://via.placeholder.com/300x450?text=No+Image";
  document.getElementById("heroBg").style.backgroundImage = `url('${posterUrl}')`;
  document.getElementById("heroPoster").src = posterUrl;

  document.getElementById("heroPlayBtn").onclick = () => {
    currentMedia = { imdbID: data.imdbID, type: data.Type, season: 1, episode: 1 };
    openPlayer();
  };
  document.getElementById("heroMoreBtn").onclick = () => loadDetails(data.imdbID);
}

// --- Navigation & UX ---
function scrollToSection(id) {
  sidebar.classList.remove("show");
  document.getElementById(id).scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusSearch() {
  sidebar.classList.remove("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => searchInput.focus(), 300);
}

function scrollCarousel(id, direction) {
  const container = document.getElementById(id);
  const scrollAmount = container.clientWidth * 0.8;
  container.scrollBy({ left: scrollAmount * direction, behavior: 'smooth' });
}

function showSkeletons(container, count = 8) {
  container.innerHTML = Array(count).fill('<div class="skeleton-card" tabindex="0"></div>').join("");
}

// --- Search ---
async function showAutocomplete() {
  const query = searchInput.value.trim();
  if (query.length < 2) { autocompleteDiv.style.display = "none"; return; }
  
  autocompleteDiv.style.display = "block";
  autocompleteDiv.innerHTML = '<div style="padding:1rem;">Searching...</div>';
  
  const data = await fetchWithCache(`https://www.omdbapi.com/?s=${encodeURIComponent(query)}&apikey=${omdbKey}`);
  if (data.Response === "False") {
    autocompleteDiv.innerHTML = '<div style="padding:1rem;">No matches found</div>';
    return;
  }
  
  autocompleteDiv.innerHTML = "";
  data.Search.slice(0, 5).forEach(item => {
    const div = document.createElement("div"); div.className = "ac-item";
    const img = item.Poster !== "N/A" ? item.Poster : "https://via.placeholder.com/30x45";
    div.innerHTML = `<img src="${img}"> <div><strong>${item.Title}</strong><br><small>${item.Year}</small></div>`;
    div.onclick = () => { searchInput.value = item.Title; autocompleteDiv.style.display = "none"; executeSearch(); };
    autocompleteDiv.appendChild(div);
  });
}

async function executeSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  autocompleteDiv.style.display = "none";
  searchSection.style.display = "block";
  scrollToSection("searchSection");
  showSkeletons(searchCarousel, 10);

  try {
    const data = await fetchWithCache(`https://www.omdbapi.com/?s=${encodeURIComponent(query)}&apikey=${omdbKey}`);
    if (data.Response === "False") throw new Error("No results found");
    
    let items = data.Search;
    const typeFilter = document.getElementById("filterType").value;
    if (typeFilter !== "all") items = items.filter(i => i.Type === typeFilter);

    renderCarouselCards(searchCarousel, items);
  } catch (err) { 
    searchCarousel.innerHTML = `<div style="padding:2rem;">${err.message}</div>`; 
  }
}

// --- Carousels ---
function renderCarouselCards(container, items) {
  container.innerHTML = "";
  items.forEach((item, index) => {
    const poster = item.Poster !== "N/A" ? item.Poster : "https://via.placeholder.com/210x300?text=No+Image";
    const card = document.createElement("div");
    card.className = "result-card";
    card.tabIndex = 0; // Make focusable
    card.dataset.imdbid = item.imdbID || item;
    card.innerHTML = `
      <img src="${poster}" loading="lazy" alt="${item.Title}">
      <div class="card-overlay">
        <div class="play-icon">▶</div>
        <h4>${item.Title}</h4>
        <p>${item.Year}</p>
      </div>
    `;
    card.onclick = () => loadDetails(item.imdbID || item); 
    container.appendChild(card);
  });
}

async function loadCarousels() {
  const favs = getList("favorites");
  const recents = getList("recent");
  
  if(favs.length > 0) renderCarouselCards(favoritesCarousel, favs.map(f => ({imdbID: f.imdbID, Title: f.title, Poster: f.poster, Year: ""})));
  else favoritesCarousel.innerHTML = "<p style='padding:1rem;color:#666;'>No favorites yet.</p>";

  if(recents.length > 0) {
    showSkeletons(recentCarousel, recents.length);
    const recentData = await Promise.all(recents.map(id => fetchWithCache(`https://www.omdbapi.com/?i=${id}&apikey=${omdbKey}`, id)));
    renderCarouselCards(recentCarousel, recentData.filter(d => d.Response !== "False"));
  } else recentCarousel.innerHTML = "<p style='padding:1rem;color:#666;'>No watch history.</p>";
}

// --- Details Modal ---
async function loadDetails(imdbID) {
  modalDetailsBody.innerHTML = '<div style="text-align:center;width:100%;"><div class="skeleton-card" style="width:200px;margin:0 auto;"></div><p>Loading details...</p></div>';
  detailsModal.style.display = "flex";
  document.body.style.overflow = "hidden";

  const data = await fetchWithCache(`https://www.omdbapi.com/?i=${imdbID}&plot=full&apikey=${omdbKey}`, imdbID);
  
  if(data.Response === "False") {
      modalDetailsBody.innerHTML = `<div style="text-align:center;width:100%;color:red;">Error loading details.</div>`;
      return;
  }
  
  currentMedia = { imdbID: imdbID, type: data.Type, season: 1, episode: 1 };
  const favs = getList("favorites");
  const isFav = favs.some(f => f.imdbID === imdbID);

  let tvControls = "";
  if (data.Type === "series") {
    const totalSeasons = parseInt(data.totalSeasons) || 1;
    let seasonOpts = Array.from({length:totalSeasons},(_,i)=>`<option value="${i+1}">Season ${i+1}</option>`).join("");
    tvControls = `
      <div id="tvSelector">
        <div style="flex:1;">
            <label style="font-size:0.8rem;color:var(--accent);display:block;margin-bottom:0.3rem;">Season</label>
            <select id="seasonSelect" class="custom-select" style="width:100%;" onchange="fetchEpisodes(this.value)">${seasonOpts}</select>
        </div>
        <div style="flex:2;">
            <label style="font-size:0.8rem;color:var(--accent);display:block;margin-bottom:0.3rem;">Episode</label>
            <select id="episodeSelect" class="custom-select" style="width:100%;" onchange="updateEpisode(this.value)"><option value="1">Loading...</option></select>
        </div>
      </div>
    `;
  }

  modalDetailsBody.innerHTML = `
    <div class="modal-details-layout">
      <div class="modal-poster">
        <img src="${data.Poster !== "N/A" ? data.Poster : "https://via.placeholder.com/300x450"}" alt="">
      </div>
      <div class="modal-info">
        <h2>${data.Title}</h2>
        <div class="modal-meta">
          <span>${data.Year}</span> • <span>${data.Rated}</span> • <span>${data.Runtime}</span> • <span>⭐ ${data.imdbRating}</span>
        </div>
        <p><strong>Genre:</strong> ${data.Genre}</p>
        <p><strong>Cast:</strong> ${data.Actors}</p>
        <p style="margin-top:1rem; line-height:1.6;">${data.Plot}</p>
        
        ${tvControls}

        <div class="modal-actions">
          <button class="btn primary-btn" onclick="openPlayer()">▶ Play</button>
          <button class="btn secondary-btn" onclick="toggleFavModal('${data.Title.replace(/'/g, "\\'")}', '${data.Poster}', '${imdbID}')" id="favBtnModal">
            ${isFav ? '♥ Remove Favorite' : '♡ Add to Favorites'}
          </button>
        </div>
      </div>
    </div>
  `;

  if (data.Type === "series") fetchEpisodes(1);
  addHistory(imdbID);
  
  setTimeout(() => document.querySelector("#detailsModal .close-btn").focus(), 100);
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
  document.body.style.overflow = "auto";
}

async function fetchEpisodes(season) {
  currentMedia.season = season;
  const epSelect = document.getElementById("episodeSelect");
  epSelect.innerHTML = "<option>Loading...</option>";
  const data = await fetchWithCache(`https://www.omdbapi.com/?i=${currentMedia.imdbID}&Season=${season}&apikey=${omdbKey}`);
  if (data.Response === "False") { epSelect.innerHTML = `<option value="1">Episode 1</option>`; return; }
  epSelect.innerHTML = data.Episodes.map((ep, i) => `<option value="${i+1}">Ep ${i+1}: ${ep.Title}</option>`).join("");
  currentMedia.episode = epSelect.value;
}
window.updateEpisode = val => currentMedia.episode = val;

// --- Player Logic ---
function openPlayer() {
  detailsModal.style.display = "none"; 
  playerModal.style.display = "flex";
  document.body.style.overflow = "hidden";
  
  let src = currentMedia.type === "series" 
    ? `https://vidsrcme.ru/embed/tv/?imdb=${currentMedia.imdbID}&season=${currentMedia.season}&episode=${currentMedia.episode}`
    : `https://vidsrcme.ru/embed/movie/?imdb=${currentMedia.imdbID}`;
    
  playerContainer.innerHTML = `<iframe src="${src}" allowfullscreen></iframe>`;
}

function closePlayer() {
  playerModal.style.display = "none";
  playerContainer.innerHTML = "";
  document.body.style.overflow = "auto";
  loadCarousels(); 
}

window.toggleFavModal = (title, poster, imdbID) => {
  const favs = getList("favorites");
  const index = favs.findIndex(f => f.imdbID === imdbID);
  const btn = document.getElementById("favBtnModal");
  if(index > -1) {
    favs.splice(index, 1);
    btn.innerHTML = "♡ Add to Favorites";
  } else {
    favs.unshift({title, poster, imdbID});
    btn.innerHTML = "♥ Remove Favorite";
  }
  saveList("favorites", favs);
  loadCarousels(); 
}

function addHistory(imdbID) {
  const hist = getList("recent");
  if(!hist.includes(imdbID)){ 
    hist.unshift(imdbID); 
    if(hist.length > 20) hist.pop(); 
    saveList("recent", hist); 
  }
}

// --- Spatial Keyboard Navigation ---
document.addEventListener("keydown", (e) => {
  if (e.key === "/") { 
    if(document.activeElement !== searchInput) {
        e.preventDefault(); 
        focusSearch(); 
    }
    return;
  }
  if (e.key === "Escape") {
    if (playerModal.style.display === "flex") closePlayer();
    else if (detailsModal.style.display === "flex") closeModal("detailsModal");
    else if (autocompleteDiv.style.display === "block") autocompleteDiv.style.display = "none";
    return;
  }
  if (e.key === "Enter") {
    if (document.activeElement === searchInput) { executeSearch(); return; }
    if (document.activeElement.classList.contains("result-card")) {
      document.activeElement.click();
      return;
    }
  }

  if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
    const active = document.activeElement;
    if (!active.classList.contains("result-card")) return; 
    
    e.preventDefault(); 
    const currentRow = active.closest(".carousel");
    const cards = Array.from(currentRow.querySelectorAll(".result-card"));
    const currentIndex = cards.indexOf(active);

    if (e.key === "ArrowRight" && currentIndex < cards.length - 1) {
      cards[currentIndex + 1].focus();
      cards[currentIndex + 1].scrollIntoView({behavior: "smooth", block: "nearest", inline: "center"});
    } else if (e.key === "ArrowLeft" && currentIndex > 0) {
      cards[currentIndex - 1].focus();
      cards[currentIndex - 1].scrollIntoView({behavior: "smooth", block: "nearest", inline: "center"});
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const allRows = Array.from(document.querySelectorAll(".carousel"));
      const rowIndex = allRows.indexOf(currentRow);
      let targetRow = null;
      if (e.key === "ArrowDown" && rowIndex < allRows.length - 1) targetRow = allRows[rowIndex + 1];
      if (e.key === "ArrowUp" && rowIndex > 0) targetRow = allRows[rowIndex - 1];
      
      if (targetRow) {
        const targetCards = targetRow.querySelectorAll(".result-card");
        if (targetCards.length > 0) {
          const nextTarget = targetCards[Math.min(currentIndex, targetCards.length - 1)];
          nextTarget.focus();
          targetRow.closest('.content-row').scrollIntoView({behavior: "smooth", block: "center"});
        }
      }
    }
  }
});

// --- Analytics Dashboard Processing ---
function renderAnalytics() {
  const recents = getList("recent");
  const favs = getList("favorites");
  const cache = getCache();
  
  document.getElementById("statTotalItems").textContent = recents.length;
  
  let genreCounts = {};
  recents.forEach(id => {
    if(cache[id] && cache[id].data && cache[id].data.Genre) {
      const genres = cache[id].data.Genre.split(", ");
      genres.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
    }
  });
  
  let maxCount = 0;
  for (const [genre, count] of Object.entries(genreCounts)) {
    if (count > maxCount) { maxCount = count; topUserGenre = genre; }
  }
  document.getElementById("statTopGenre").textContent = topUserGenre;
  
  let totalRating = 0;
  let ratingCount = 0;
  favs.forEach(f => {
    if(cache[f.imdbID] && cache[f.imdbID].data && cache[f.imdbID].data.imdbRating !== "N/A") {
      totalRating += parseFloat(cache[f.imdbID].data.imdbRating);
      ratingCount++;
    }
  });
  
  const avg = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : "0.0";
  document.getElementById("statAvgRating").textContent = avg;
}
