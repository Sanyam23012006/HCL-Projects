const movieForm = document.getElementById('movie-form');
const movieMessage = document.getElementById('movie-message');
const movieList = document.getElementById('movie-list');
const movieCount = document.getElementById('movie-count');
const logoutButton = document.getElementById('logout-button');
const formHeading = document.getElementById('movie-form-heading');
const submitButton = document.getElementById('movie-submit-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
let movies = [];
let editingMovieId = null;

movieForm.elements.year.max = new Date().getFullYear() + 5;

async function loadMovies() {
  const response = await fetch('/api/movies');
  if (!response.ok) {
    throw new Error('Unable to load the movie library.');
  }

  const result = await response.json();
  movies = result.movies;
  movieCount.textContent = `${movies.length} movies`;
  movieList.replaceChildren(...movies.map((movie) => {
    const item = document.createElement('div');
    item.className = 'movie-list-item';

    const details = document.createElement('div');
    details.className = 'movie-list-details';
    const title = document.createElement('strong');
    title.textContent = movie.title;
    const metadata = document.createElement('span');
    metadata.textContent = `${movie.year} · ${movie.genres.join(', ')}`;
    details.append(title, metadata);

    const actions = document.createElement('div');
    actions.className = 'movie-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'button-link';
    editButton.dataset.action = 'edit';
    editButton.dataset.movieId = movie.id;
    editButton.textContent = 'Edit';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'button-link danger-button';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.movieId = movie.id;
    deleteButton.textContent = 'Delete';

    actions.append(editButton, deleteButton);
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
  formHeading.textContent = 'Add a movie';
  submitButton.textContent = 'Save movie';
  cancelEditButton.hidden = true;
}

function editMovie(movie) {
  editingMovieId = movie.id;
  movieForm.elements.title.value = movie.title;
  movieForm.elements.genres.value = movie.genres.join(', ');
  movieForm.elements.mood.value = movie.mood;
  movieForm.elements.year.value = movie.year;
  movieForm.elements.rating.value = movie.rating;
  movieForm.elements.runtime.value = movie.runtime;
  movieForm.elements.director.value = movie.director;
  movieForm.elements.posterUrl.value = movie.posterUrl || '';
  movieForm.elements.description.value = movie.description;
  formHeading.textContent = 'Edit movie';
  submitButton.textContent = 'Save changes';
  cancelEditButton.hidden = false;
  showMessage(`Editing ${movie.title}.`);
  movieForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getMoviePayload() {
  const formData = new FormData(movieForm);
  return {
    title: formData.get('title'),
    genres: formData.get('genres'),
    mood: formData.get('mood'),
    year: formData.get('year'),
    rating: formData.get('rating'),
    runtime: formData.get('runtime'),
    director: formData.get('director'),
    posterUrl: formData.get('posterUrl'),
    description: formData.get('description')
  };
}

movieForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(editingMovieId ? 'Saving changes...' : 'Saving...');

  const isEditing = Boolean(editingMovieId);
  const movieId = editingMovieId;
  const endpoint = isEditing
    ? `/api/movies/${encodeURIComponent(movieId)}`
    : '/api/movies';

  try {
    const response = await fetch(endpoint, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getMoviePayload())
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to save the movie.');
    }

    clearEditMode();
    showMessage(isEditing
      ? `${result.movie.title} was updated successfully.`
      : `${result.movie.title} was saved successfully.`, 'success');
    await loadMovies();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

movieList.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const movie = movies.find((item) => item.id === button.dataset.movieId);
  if (!movie) {
    showMessage('That movie is no longer in the library. Refresh the list and try again.', 'error');
    return;
  }

  if (button.dataset.action === 'edit') {
    editMovie(movie);
    return;
  }

  if (button.dataset.action !== 'delete' || !window.confirm(`Delete "${movie.title}"? This cannot be undone.`)) {
    return;
  }

  button.disabled = true;
  showMessage(`Deleting ${movie.title}...`);
  try {
    const response = await fetch(`/api/movies/${encodeURIComponent(movie.id)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to delete the movie.');
    }

    if (editingMovieId === movie.id) clearEditMode();
    showMessage(`${result.movie.title} was deleted.`, 'success');
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
  showMessage(error.message, 'error');
});
