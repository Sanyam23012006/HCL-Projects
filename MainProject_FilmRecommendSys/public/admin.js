const movieForm = document.getElementById('movie-form');
const movieMessage = document.getElementById('movie-message');
const movieList = document.getElementById('movie-list');
const movieCount = document.getElementById('movie-count');
const logoutButton = document.getElementById('logout-button');
movieForm.elements.year.max = new Date().getFullYear() + 5;

async function loadMovies() {
  const response = await fetch('/api/movies');
  if (!response.ok) {
    throw new Error('Unable to load the movie library.');
  }

  const result = await response.json();
  movieCount.textContent = `${result.movies.length} movies`;
  movieList.replaceChildren(...result.movies.map((movie) => {
    const item = document.createElement('div');
    item.className = 'movie-list-item';
    const title = document.createElement('strong');
    title.textContent = movie.title;
    item.append(title, document.createTextNode(` — ${movie.year} · ${movie.genres.join(', ')}`));
    return item;
  }));
}

movieForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  movieMessage.textContent = 'Saving...';
  movieMessage.className = 'form-message';
  const formData = new FormData(movieForm);

  try {
    const response = await fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.get('title'),
        genres: formData.get('genres'),
        mood: formData.get('mood'),
        year: formData.get('year'),
        rating: formData.get('rating'),
        runtime: formData.get('runtime'),
        director: formData.get('director'),
        description: formData.get('description')
      })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to save the movie.');
    }

    movieForm.reset();
    movieMessage.textContent = `${result.movie.title} was saved successfully.`;
    movieMessage.classList.add('success');
    await loadMovies();
  } catch (error) {
    movieMessage.textContent = error.message;
    movieMessage.classList.add('error');
  }
});

logoutButton.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.assign('/login');
});

loadMovies().catch((error) => {
  movieMessage.textContent = error.message;
  movieMessage.classList.add('error');
});
