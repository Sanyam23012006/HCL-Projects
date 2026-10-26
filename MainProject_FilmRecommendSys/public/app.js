const form = document.getElementById('preference-form');
const genreSelect = document.getElementById('favoriteGenre');
const languageSelect = document.getElementById('language');
const minimumRatingInput = document.getElementById('minimumRating');
const includeLatestInput = document.getElementById('includeLatest');
const recommendationsContainer = document.getElementById('recommendations');
const statusBadge = document.getElementById('statusBadge');
const userLoginLink = document.getElementById('user-login-link');
const signupLink = document.getElementById('signup-link');
const userWelcome = document.getElementById('user-welcome');
const preferencesLink = document.getElementById('preferences-link');
const watchlistLink = document.getElementById('watchlist-link');
const userLogoutButton = document.getElementById('user-logout-button');
let currentRecommendations = [];

async function loadOptions() {
  const response = await fetch('/api/recommendation-options');
  if (!response.ok) throw new Error('Unable to load collaborative dataset filters.');
  const result = await response.json();

  populateSelect(genreSelect, result.genres);
  populateSelect(languageSelect, result.languages);
}

function populateSelect(selectElement, values) {
  selectElement.replaceChildren(...values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    return option;
  }));
}

function setSelectedValues(selectElement, values) {
  const selected = new Set(values);
  for (const option of selectElement.options) {
    option.selected = selected.has(option.value);
  }
}

function getSelectedValues(selectElement) {
  return [...selectElement.selectedOptions].map((option) => option.value);
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
  currentRecommendations = items || [];
  if (!items || items.length === 0) {
    recommendationsContainer.innerHTML = '<div class="empty-state">No films match your current filter. Try adjusting the genre or rating.</div>';
    return;
  }

  recommendationsContainer.innerHTML = items
    .map((movie) => {
      const genres = movie.genres.map((genre) => `<span class="genre-chip">${escapeHtml(genre)}</span>`).join('');
      const reasons = Array.isArray(movie.reasons)
        ? movie.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')
        : '';
      const reviews = Array.isArray(movie.reviews) ? movie.reviews : [];
      const reviewItems = reviews.length
        ? reviews.map((review) => `
          <article class="review-item">
            <div class="review-heading">
              <strong>${escapeHtml(review.name)}</strong>
              <span>${escapeHtml(review.rating)}/10</span>
            </div>
            <p>${escapeHtml(review.text)}</p>
          </article>
        `).join('')
        : '<p class="review-empty">No reviews yet. Be the first to share your thoughts.</p>';
      const ratingSummary = movie.reviewCount
        ? `★ ${Number(movie.communityRating).toFixed(1)}/10 from ${movie.reviewCount} ${movie.reviewCount === 1 ? 'review' : 'reviews'}`
        : 'No community ratings yet';
      const ownReview = movie.myReview;
      const poster = movie.posterUrl
        ? `<img class="movie-poster" src="${escapeHtml(movie.posterUrl)}" alt="Poster for ${escapeHtml(movie.title)}" loading="lazy" />`
        : '';
      const watchlistButton = signedInUser
        ? `<button class="button-link watchlist-button" type="button" data-movie-id="${escapeHtml(movie.id)}" aria-pressed="${Boolean(movie.inWatchlist)}">${movie.inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}</button>`
        : '<a class="watchlist-signin" href="/user-login">Sign in to save</a>';
      const reviewForm = signedInUser
        ? `
        <form class="review-form" data-movie-id="${escapeHtml(movie.id)}" data-has-review="${Boolean(ownReview)}">
            <h4>${ownReview ? 'Edit your review' : 'Write a review'}</h4>
            <label for="review-rating-${escapeHtml(movie.id)}">Your rating (1-10)</label>
            <input id="review-rating-${escapeHtml(movie.id)}" name="rating" type="number" min="1" max="10" step="1" value="${ownReview ? escapeHtml(ownReview.rating) : 8}" required />
            <label for="review-text-${escapeHtml(movie.id)}">Your review</label>
            <textarea id="review-text-${escapeHtml(movie.id)}" name="text" maxlength="1000" minlength="3" rows="3" required>${ownReview ? escapeHtml(ownReview.text) : ''}</textarea>
            <p class="form-message review-message" role="status" aria-live="polite"></p>
            <button type="submit">${ownReview ? 'Update review' : 'Submit review'}</button>
          </form>
        `
        : '<p class="review-signin"><a href="/user-login">Sign in</a> to rate and review this movie.</p>';
      const reviewCountLabel = movie.reviewCount > reviews.length
        ? `<p class="review-count-note">Showing the latest ${reviews.length} of ${movie.reviewCount} reviews.</p>`
        : '';
      const cardActions = movie.datasetOnly
        ? `<p class="field-hint">CSV dataset recommendation · ${escapeHtml(movie.datasetRatingCount)} dataset ratings · ${escapeHtml(movie.language)}</p>`
        : `<div class="movie-card-actions">${watchlistButton}</div>
          ${reasons ? `<div class="match-explanation"><h4>Why this was recommended</h4><ul>${reasons}</ul></div>` : ''}
          <section class="movie-reviews" aria-label="Reviews for ${escapeHtml(movie.title)}">
            <h4>Community reviews <span class="community-rating">${escapeHtml(ratingSummary)}</span></h4>
            <div class="review-list">${reviewItems}</div>
            ${reviewCountLabel}
            ${reviewForm}
          </section>`;
      return `
        <article class="movie-card">
          ${poster}
          <div class="movie-top-row">
            <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
            <span class="movie-score">${Number(movie.score).toFixed(1)}</span>
          </div>
          <div class="meta">
            <span>${escapeHtml(movie.year)}</span>
            ${movie.runtime ? `<span>•</span><span>${escapeHtml(movie.runtime)} min</span>` : ''}
            <span>•</span>
            <span>⭐ ${escapeHtml(movie.rating)}</span>
            ${movie.director ? `<span>•</span><span>${escapeHtml(movie.director)}</span>` : ''}
          </div>
          <div class="meta">${genres}</div>
          ${movie.datasetOnly ? '' : `<p>${escapeHtml(movie.description)}</p>`}
          ${cardActions}
          ${movie.datasetOnly && reasons ? `<div class="match-explanation"><h4>Why this was recommended</h4><ul>${reasons}</ul></div>` : ''}
        </article>
      `;
    })
    .join('');
}

let signedInUser = null;

async function loadUserSession() {
  const response = await fetch('/api/user/session');
  if (!response.ok) {
    throw new Error('Unable to check user sign-in status.');
  }
  const result = await response.json();
  signedInUser = result.authenticated ? result.user : null;

  userLoginLink.hidden = result.authenticated;
  signupLink.hidden = result.authenticated;
  userWelcome.hidden = !result.authenticated;
  preferencesLink.hidden = !result.authenticated;
  watchlistLink.hidden = !result.authenticated;
  userLogoutButton.hidden = !result.authenticated;
  if (result.authenticated) {
    userWelcome.textContent = `Hi, ${result.user.name}`;
    const preferences = result.user.preferences;
    setSelectedValues(genreSelect, preferences.favoriteGenres);
    minimumRatingInput.value = preferences.minimumRating;
  }
}

userLogoutButton.addEventListener('click', async () => {
  userLogoutButton.disabled = true;
  try {
    const response = await fetch('/api/user/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Unable to sign out.');
    await loadUserSession();
    setSelectedValues(genreSelect, []);
    setSelectedValues(languageSelect, []);
    minimumRatingInput.value = '7.5';
    signedInUser = null;
    await form.requestSubmit();
  } catch (error) {
    statusBadge.textContent = 'Sign-out failed';
    console.error(error);
  } finally {
    userLogoutButton.disabled = false;
  }
});

recommendationsContainer.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('.watchlist-button');
  if (!button) return;

  const movieId = button.dataset.movieId;
  const movie = currentRecommendations.find((item) => item.id === movieId);
  if (!movie) return;

  button.disabled = true;
  try {
    const response = await fetch(`/api/user/watchlist/${encodeURIComponent(movieId)}`, {
      method: movie.inWatchlist ? 'DELETE' : 'POST'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to update your watchlist.');
    movie.inWatchlist = result.inWatchlist;
    renderRecommendations(currentRecommendations);
    statusBadge.textContent = result.inWatchlist ? 'Added to watchlist' : 'Removed from watchlist';
  } catch (error) {
    statusBadge.textContent = 'Watchlist update failed';
    console.error(error);
  }
});

recommendationsContainer.addEventListener('submit', async (event) => {
  if (!(event.target instanceof HTMLFormElement) || !event.target.matches('.review-form')) return;
  event.preventDefault();

  const reviewForm = event.target;
  const movieId = reviewForm.dataset.movieId;
  const ratingInput = reviewForm.elements.rating;
  const textInput = reviewForm.elements.text;
  const message = reviewForm.querySelector('.review-message');
  const submitButton = reviewForm.querySelector('button[type="submit"]');

  message.textContent = 'Saving review...';
  message.className = 'form-message review-message';
  submitButton.disabled = true;

  try {
    const response = await fetch(`/api/movies/${encodeURIComponent(movieId)}/reviews`, {
      method: reviewForm.dataset.hasReview === 'true' ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: ratingInput.value, text: textInput.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save your review.');
    await form.requestSubmit();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
    submitButton.disabled = false;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    favoriteGenres: getSelectedValues(genreSelect),
    languages: getSelectedValues(languageSelect),
    minimumRating: Number(minimumRatingInput.value) || 0,
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
  .then(() => loadUserSession())
  .then(() => form.requestSubmit())
  .catch((error) => {
    statusBadge.textContent = 'Error';
    recommendationsContainer.innerHTML = '<div class="empty-state">Unable to load movies right now.</div>';
    console.error(error);
  });
