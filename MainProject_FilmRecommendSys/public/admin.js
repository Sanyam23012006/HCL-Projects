const movieMessage = document.getElementById('movie-message');
const movieList = document.getElementById('movie-list');
const movieCount = document.getElementById('movie-count');
const logoutButton = document.getElementById('logout-button');
const movieForm = document.getElementById('movie-form');
const formHeading = document.getElementById('movie-form-heading');
const submitButton = document.getElementById('movie-submit-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
const ratingField = document.getElementById('initial-rating-field');
let movies = [];
let editingMovieId = null;

async function loadMovies() {
  const response = await fetch('/api/dataset-movies');
  const result = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || 'Unable to load the CSV movie dataset.');
  }

  movies = result.movies;
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
    const actions = document.createElement('div');
    actions.className = 'movie-actions';
    for (const action of ['edit', 'delete']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action === 'delete' ? 'button-link danger-button' : 'button-link';
      button.dataset.action = action;
      button.dataset.movieId = movie.id;
      button.textContent = action === 'edit' ? 'Edit' : 'Delete';
      actions.append(button);
    }
    item.append(details, actions);
    return item;
  }));
}

function showMessage(message, type = '') {
  movieMessage.textContent = message;
  movieMessage.className = `form-message${type ? ` ${type}` : ''}`;
}

function clearEditMode() {
  editingMovieId = null;
  movieForm.reset();
  movieForm.elements.rating.value = '3';
  formHeading.textContent = 'Add a CSV movie';
  submitButton.textContent = 'Add movie';
  ratingField.hidden = false;
  cancelEditButton.hidden = true;
}

async function readJsonResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(response.status === 404
      ? 'The CSV admin route is unavailable. Restart the server and reload this page.'
      : `The server returned an invalid response (HTTP ${response.status}).`);
  }
}

movieForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(movieForm);
  const payload = {
    title: formData.get('title'),
    genre: formData.get('genre'),
    language: formData.get('language'),
    releaseYear: formData.get('releaseYear')
  };
  if (!editingMovieId) payload.rating = formData.get('rating');

  const isEditing = Boolean(editingMovieId);
  const endpoint = isEditing
    ? `/api/admin/dataset-movies/${encodeURIComponent(editingMovieId)}`
    : '/api/admin/dataset-movies';
  showMessage(isEditing ? 'Updating CSV movie...' : 'Adding CSV movie...');
  submitButton.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || 'Unable to save the CSV movie.');
    clearEditMode();
    showMessage(isEditing
      ? `${result.movie.title} was updated in the CSV.`
      : `${result.movie.title} was added to the CSV.`, 'success');
    await loadMovies();
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

movieList.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const movie = movies.find((item) => item.id === button.dataset.movieId);
  if (!movie) {
    showMessage('That CSV movie is no longer available. Refresh the list and try again.', 'error');
    return;
  }

  if (button.dataset.action === 'edit') {
    editingMovieId = movie.id;
    movieForm.elements.title.value = movie.title;
    movieForm.elements.genre.value = movie.genres[0];
    movieForm.elements.language.value = movie.language;
    movieForm.elements.releaseYear.value = movie.year;
    ratingField.hidden = true;
    formHeading.textContent = 'Update CSV movie';
    submitButton.textContent = 'Save changes';
    cancelEditButton.hidden = false;
    showMessage(`Editing ${movie.title}. Existing user ratings will be preserved.`);
    movieForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (button.dataset.action !== 'delete' || !window.confirm(`Delete "${movie.title}" and all its CSV rating rows? This cannot be undone.`)) {
    return;
  }

  button.disabled = true;
  showMessage(`Deleting ${movie.title} from the CSV...`);
  try {
    const response = await fetch(`/api/admin/dataset-movies/${encodeURIComponent(movie.id)}`, { method: 'DELETE' });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || 'Unable to delete the CSV movie.');
    if (editingMovieId === movie.id) clearEditMode();
    showMessage(`${result.movie.title} and its CSV rating rows were deleted.`, 'success');
    await loadMovies();
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, 'error');
  }
});

cancelEditButton.addEventListener('click', () => {
  clearEditMode();
  showMessage('Edit cancelled.');
});

logoutButton.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.assign('/login');
});

loadMovies().catch((error) => {
  movieCount.textContent = 'Error';
  showMessage(error.message, 'error');
});
