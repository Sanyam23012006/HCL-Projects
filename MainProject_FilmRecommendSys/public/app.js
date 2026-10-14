const form = document.getElementById('preference-form');
const genreSelect = document.getElementById('favoriteGenre');
const moodSelect = document.getElementById('mood');
const minimumRatingInput = document.getElementById('minimumRating');
const maxRuntimeInput = document.getElementById('maxRuntime');
const includeLatestInput = document.getElementById('includeLatest');
const recommendationsContainer = document.getElementById('recommendations');
const statusBadge = document.getElementById('statusBadge');

async function loadOptions() {
  const response = await fetch('/api/movies');
  const result = await response.json();

  const genres = ['Any', ...result.genres];
  const moods = ['Any', ...result.moods];

  populateSelect(genreSelect, genres, 'Any');
  populateSelect(moodSelect, moods, 'Any');
}

function populateSelect(selectElement, values, defaultValue) {
  selectElement.replaceChildren(...values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    return option;
  }));
  selectElement.value = defaultValue;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function renderRecommendations(items) {
  if (!items || items.length === 0) {
    recommendationsContainer.innerHTML = '<div class="empty-state">No films match your current filter. Try adjusting the genre or rating.</div>';
    return;
  }

  recommendationsContainer.innerHTML = items
    .map((movie) => {
      const genres = movie.genres.map((genre) => `<span class="genre-chip">${escapeHtml(genre)}</span>`).join('');
      return `
        <article class="movie-card">
          <div class="movie-top-row">
            <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
            <span class="movie-score">${Number(movie.score).toFixed(1)}</span>
          </div>
          <div class="meta">
            <span>${escapeHtml(movie.year)}</span>
            <span>•</span>
            <span>${escapeHtml(movie.runtime)} min</span>
            <span>•</span>
            <span>⭐ ${escapeHtml(movie.rating)}</span>
            <span>•</span>
            <span>${escapeHtml(movie.director)}</span>
          </div>
          <div class="meta">${genres}</div>
          <p>${escapeHtml(movie.description)}</p>
        </article>
      `;
    })
    .join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    favoriteGenre: genreSelect.value === 'Any' ? '' : genreSelect.value,
    mood: moodSelect.value === 'Any' ? '' : moodSelect.value,
    minimumRating: Number(minimumRatingInput.value) || 0,
    maxRuntime: Number(maxRuntimeInput.value) || 180,
    includeLatest: includeLatestInput.checked ? 1 : 0
  };

  statusBadge.textContent = 'Loading...';

  try {
    const response = await fetch('/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    renderRecommendations(result.recommendations || []);
    statusBadge.textContent = result.recommendations?.length ? 'Recommendations ready' : 'No matches';
  } catch (error) {
    statusBadge.textContent = 'Error';
    recommendationsContainer.innerHTML = '<div class="empty-state">Unable to fetch recommendations right now.</div>';
    console.error(error);
  }
});

loadOptions()
  .then(() => form.requestSubmit())
  .catch((error) => {
    statusBadge.textContent = 'Error';
    recommendationsContainer.innerHTML = '<div class="empty-state">Unable to load movies right now.</div>';
    console.error(error);
  });
