const movieMessage = document.getElementById('movie-message');
const movieList = document.getElementById('movie-list');
const movieCount = document.getElementById('movie-count');
const logoutButton = document.getElementById('logout-button');

async function readJsonResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (response.status === 404) {
      throw new Error('The CSV catalog route is unavailable. Restart the server from MainProject_FilmRecommendSys with `node start.js`, then reload this page.');
    }
    throw new Error(`The server returned an invalid response (HTTP ${response.status}).`);
  }
}

async function loadMovies() {
  const response = await fetch('/api/dataset-movies');
  const result = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || 'Unable to load the CSV movie dataset.');
  }

  const movies = result.movies;
  movieCount.textContent = `${movies.length} CSV ${movies.length === 1 ? 'movie' : 'movies'}`;
  movieList.replaceChildren(...movies.map((movie) => {
    const item = document.createElement('div');
    item.className = 'movie-list-item';

    const details = document.createElement('div');
    details.className = 'movie-list-details';
    const title = document.createElement('strong');
    title.textContent = movie.title;
    const metadata = document.createElement('span');
    metadata.textContent = `${movie.year} · ${movie.genres.join(', ')} · ${movie.language} · ${movie.rating}/5 from ${movie.datasetRatingCount} ratings`;
    details.append(title, metadata);
    item.append(details);
    return item;
  }));
}

function showMessage(message, type = '') {
  movieMessage.textContent = message;
  movieMessage.className = `form-message${type ? ` ${type}` : ''}`;
}

logoutButton.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.assign('/login');
});

loadMovies().catch((error) => {
  movieCount.textContent = 'Error';
  showMessage(error.message, 'error');
});
