const authForm = document.getElementById('user-auth-form');
const authMessage = document.getElementById('auth-message');
const mode = authForm.dataset.mode;

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessage.textContent = mode === 'register' ? 'Creating account...' : 'Signing in...';
  authMessage.className = 'form-message';

  const password = authForm.elements.password.value;
  if (mode === 'register' && password !== authForm.elements.confirmPassword.value) {
    authMessage.textContent = 'The passwords do not match.';
    authMessage.classList.add('error');
    return;
  }

  const payload = {
    email: authForm.elements.email.value,
    password
  };
  if (mode === 'register') {
    payload.name = authForm.elements.name.value;
  }

  try {
    const response = await fetch(mode === 'register' ? '/api/user/register' : '/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to authenticate.');
    }
    window.location.assign('/');
  } catch (error) {
    authMessage.textContent = error.message;
    authMessage.classList.add('error');
  }
});
