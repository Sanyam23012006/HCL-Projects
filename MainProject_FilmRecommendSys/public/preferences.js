const preferencesForm = document.getElementById('preferences-form');
const genresSelect = document.getElementById('favorite-genres');
const moodsSelect = document.getElementById('favorite-moods');
const minimumRatingInput = document.getElementById('minimum-rating');
const preferencesMessage = document.getElementById('preferences-message');

function populateSelect(selectElement, values) {
  selectElement.replaceChildren(...values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    return option;
  }));
}

function setSelectedValues(selectElement, values) {
  const selectedValues = new Set(values);
  for (const option of selectElement.options) {
    option.selected = selectedValues.has(option.value);
  }
}

async function loadPreferences() {
  const sessionResponse = await fetch('/api/user/session');
  if (!sessionResponse.ok) {
    throw new Error('Unable to check your account. Please try again.');
  }
  const session = await sessionResponse.json();
  if (!session.authenticated) {
    window.location.replace('/user-login');
    return;
  }

  const [moviesResponse, preferencesResponse] = await Promise.all([
    fetch('/api/movies'),
    fetch('/api/user/preferences')
  ]);
  if (!moviesResponse.ok || !preferencesResponse.ok) {
    throw new Error('Unable to load your preferences. Please try again.');
  }

  const [movieOptions, preferenceResult] = await Promise.all([
    moviesResponse.json(),
    preferencesResponse.json()
  ]);
  populateSelect(genresSelect, movieOptions.genres);
  populateSelect(moodsSelect, movieOptions.moods);
  setSelectedValues(genresSelect, preferenceResult.preferences.favoriteGenres);
  setSelectedValues(moodsSelect, preferenceResult.preferences.favoriteMoods);
  minimumRatingInput.value = preferenceResult.preferences.minimumRating;
}

preferencesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  preferencesMessage.textContent = 'Saving preferences...';
  preferencesMessage.className = 'form-message';

  try {
    const response = await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        favoriteGenres: [...genresSelect.selectedOptions].map((option) => option.value),
        favoriteMoods: [...moodsSelect.selectedOptions].map((option) => option.value),
        minimumRating: minimumRatingInput.value
      })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to save preferences.');
    }

    preferencesMessage.textContent = 'Preferences saved. They will pre-fill your next search.';
    preferencesMessage.classList.add('success');
  } catch (error) {
    preferencesMessage.textContent = error.message;
    preferencesMessage.classList.add('error');
  }
});

loadPreferences().catch((error) => {
  preferencesMessage.textContent = error.message;
  preferencesMessage.classList.add('error');
});
