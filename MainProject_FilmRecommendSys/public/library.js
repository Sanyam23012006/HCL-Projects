const libraryMovies = document.getElementById('library-movies');
const libraryMessage = document.getElementById('library-message');
const catalogCount = document.getElementById('catalog-count');
const filterForm = document.getElementById('catalog-filter');
const filterGenre = document.getElementById('catalog-genre');
const clearFiltersButton = document.getElementById('clear-catalog-filters');
const isWatchlistPage = window.location.pathname === '/watchlist';
let signedInUser = null;
let movies = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function showLibraryMessage(message, type = '') {
  libraryMessage.textContent = message;
  libraryMessage.className = `form-message${type ? ` ${type}` : ''}`;
}

async function loadUserSession() {
  const response = await fetch('/api/user/session');
  if (!response.ok) throw new Error('Unable to check your sign-in status.');
  const result = await response.json();
  signedInUser = result.authenticated ? result.user : null;

  const loginLink = document.getElementById(isWatchlistPage ? 'watchlist-login-link' : 'browse-login-link');
  const signupLink = document.getElementById(isWatchlistPage ? 'watchlist-signup-link' : 'browse-signup-link');
  const welcome = document.getElementById(isWatchlistPage ? 'watchlist-user-welcome' : 'browse-user-welcome');
  if (loginLink) loginLink.hidden = Boolean(signedInUser);
  if (signupLink) signupLink.hidden = Boolean(signedInUser);
  if (welcome) {
    welcome.hidden = !signedInUser;
    if (signedInUser) welcome.textContent = `Hi, ${signedInUser.name}`;
  }
}

function populateGenreFilter(genres) {
  if (!filterGenre) return;
  const currentGenre = filterGenre.value;
  filterGenre.replaceChildren(new Option('Any genre', ''));
  for (const genre of genres) {
    filterGenre.add(new Option(genre, genre));
  }
  if (genres.includes(currentGenre)) filterGenre.value = currentGenre;
}

function renderMovies() {
  catalogCount.textContent = `${movies.length} ${movies.length === 1 ? 'movie' : 'movies'}`;
  if (!movies.length) {
    libraryMovies.innerHTML = `<div class="empty-state">${isWatchlistPage
      ? 'Your watchlist is empty. Browse the catalog and save films you want to watch.'
      : 'No movies match those filters. Try changing your search.'}</div>`;
    return;
  }

  libraryMovies.innerHTML = movies.map((movie) => {
    const poster = movie.posterUrl
      ? `<img class="movie-poster" src="${escapeHtml(movie.posterUrl)}" alt="Poster for ${escapeHtml(movie.title)}" loading="lazy" />`
      : '<div class="poster-placeholder" aria-label="No poster available">No poster</div>';
    const genres = movie.genres.map((genre) => `<span class="genre-chip">${escapeHtml(genre)}</span>`).join('');
    const communityRating = movie.reviewCount
      ? `★ ${Number(movie.communityRating).toFixed(1)}/10 (${movie.reviewCount} ${movie.reviewCount === 1 ? 'review' : 'reviews'})`
      : 'No community reviews yet';
    const favoriteAction = signedInUser
      ? `<button class="button-link watchlist-button" type="button" data-movie-id="${escapeHtml(movie.id)}">${movie.inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}</button>`
      : '<a class="watchlist-signin" href="/user-login">Sign in to save</a>';

    return `
      <article class="catalog-card">
        ${poster}
        <div class="catalog-card-content">
          <div class="movie-top-row">
            <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
            <span class="catalog-rating">★ ${escapeHtml(movie.rating)}/10</span>
          </div>
          <div class="meta">
            <span>${escapeHtml(movie.year)}</span>
            <span>·</span>
            <span>${escapeHtml(movie.runtime)} min</span>
            <span>·</span>
            <span>${escapeHtml(movie.director)}</span>
          </div>
          <div class="meta">${genres}</div>
          <p>${escapeHtml(movie.description)}</p>
          <p class="community-rating">${escapeHtml(communityRating)}</p>
          <div class="movie-card-actions">${favoriteAction}</div>
        </div>
      </article>
    `;
  }).join('');
}

async function loadMovies() {
  showLibraryMessage('');
  const query = filterForm ? new URLSearchParams(new FormData(filterForm)) : new URLSearchParams();
  const endpoint = isWatchlistPage ? '/api/user/watchlist' : `/api/catalog?${query.toString()}`;
  const response = await fetch(endpoint);
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && isWatchlistPage) {
      libraryMovies.innerHTML = '<div class="empty-state">Sign in to view your personal watchlist. <a href="/user-login">Go to sign in</a></div>';
      catalogCount.textContent = 'Sign in required';
      return;
    }
    throw new Error(result.error || 'Unable to load movies.');
  }

  movies = result.movies;
  if (!isWatchlistPage) populateGenreFilter(result.genres);
  renderMovies();
}

libraryMovies.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('.watchlist-button');
  if (!button) return;

  const movieId = button.dataset.movieId;
  const movie = movies.find((item) => item.id === movieId);
  if (!movie) return;

  button.disabled = true;
  try {
    const response = await fetch(`/api/user/watchlist/${encodeURIComponent(movieId)}`, {
      method: movie.inWatchlist ? 'DELETE' : 'POST'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to update your watchlist.');
    if (isWatchlistPage) {
      await loadMovies();
    } else {
      movie.inWatchlist = result.inWatchlist;
      renderMovies();
    }
    showLibraryMessage(result.inWatchlist ? 'Added to your watchlist.' : 'Removed from your watchlist.', 'success');
  } catch (error) {
    button.disabled = false;
    showLibraryMessage(error.message, 'error');
  }
});

if (filterForm) {
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadMovies().catch((error) => showLibraryMessage(error.message, 'error'));
  });
  clearFiltersButton.addEventListener('click', () => {
    filterForm.reset();
    loadMovies().catch((error) => showLibraryMessage(error.message, 'error'));
  });
}

loadUserSession()
  .then(() => loadMovies())
  .catch((error) => {
    catalogCount.textContent = 'Error';
    showLibraryMessage(error.message, 'error');
  });
