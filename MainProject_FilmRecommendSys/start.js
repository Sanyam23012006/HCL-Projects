const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadLocalEnvironment() {
  const envPath = path.join(__dirname, '.env');

  try {
    const contents = fs.readFileSync(envPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const entry = line.trim();
      if (!entry || entry.startsWith('#')) continue;

      const separator = entry.indexOf('=');
      if (separator < 1) continue;

      const key = entry.slice(0, separator).trim();
      let value = entry.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Unable to read ${envPath}: ${error.message}`);
    }
  }
}

loadLocalEnvironment();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.json');
const SESSION_COOKIE = 'film_admin_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 16 * 1024;
const sessions = new Map();

const initialMovies = [
  {
    title: 'Inception',
    genres: ['Sci-Fi', 'Thriller', 'Action'],
    mood: 'Mind-bending',
    year: 2010,
    rating: 8.8,
    runtime: 148,
    director: 'Christopher Nolan',
    description: 'A skilled thief enters dreams to plant an idea in a target’s mind.'
  },
  {
    title: 'The Dark Knight',
    genres: ['Action', 'Crime', 'Drama'],
    mood: 'Intense',
    year: 2008,
    rating: 9.0,
    runtime: 152,
    director: 'Christopher Nolan',
    description: 'Batman faces a chaotic criminal mastermind while Gotham teeters on the edge.'
  },
  {
    title: 'Spirited Away',
    genres: ['Animation', 'Fantasy', 'Adventure'],
    mood: 'Calm',
    year: 2001,
    rating: 8.6,
    runtime: 125,
    director: 'Hayao Miyazaki',
    description: 'A girl wanders into a magical world and uncovers a courageous path home.'
  },
  {
    title: 'The Grand Budapest Hotel',
    genres: ['Comedy', 'Adventure', 'Drama'],
    mood: 'Playful',
    year: 2014,
    rating: 8.1,
    runtime: 100,
    director: 'Wes Anderson',
    description: 'A charming concierge and his lobby boy lead a comedic adventure through old Europe.'
  },
  {
    title: 'The Social Network',
    genres: ['Drama', 'Biography'],
    mood: 'Focused',
    year: 2010,
    rating: 7.8,
    runtime: 120,
    director: 'David Fincher',
    description: 'The rise of Facebook is told through ambition, betrayal, and legal pressure.'
  },
  {
    title: 'La La Land',
    genres: ['Comedy', 'Drama', 'Music'],
    mood: 'Romantic',
    year: 2016,
    rating: 8.0,
    runtime: 128,
    director: 'Damien Chazelle',
    description: 'A jazz pianist and an aspiring actress chase dreamlike success and love.'
  },
  {
    title: 'Arrival',
    genres: ['Sci-Fi', 'Drama'],
    mood: 'Thoughtful',
    year: 2016,
    rating: 7.9,
    runtime: 116,
    director: 'Denis Villeneuve',
    description: 'A linguist meets a mysterious alien visitor and translates the future itself.'
  },
  {
    title: 'Mad Max: Fury Road',
    genres: ['Action', 'Adventure'],
    mood: 'Adrenaline',
    year: 2015,
    rating: 8.1,
    runtime: 120,
    director: 'George Miller',
    description: 'A relentless chase across a desert wasteland becomes a brutal survival ride.'
  },
  {
    title: 'Parasite',
    genres: ['Thriller', 'Drama', 'Mystery'],
    mood: 'Suspenseful',
    year: 2019,
    rating: 8.5,
    runtime: 132,
    director: 'Bong Joon-ho',
    description: 'Class tensions explode when a poor family infiltrates a wealthy household.'
  },
  {
    title: 'Paddington 2',
    genres: ['Comedy', 'Family', 'Adventure'],
    mood: 'Heartwarming',
    year: 2017,
    rating: 8.4,
    runtime: 103,
    director: 'Paul King',
    description: 'Paddington’s cheerful heart and charm turn a simple task into a lovable quest.'
  }
];

let movies = [];
let saveQueue = Promise.resolve();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(message);
}

function serveStaticFile(res, fileName) {
  const filePath = path.resolve(PUBLIC_DIR, fileName);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendText(res, 404, 'File not found.');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendText(res, 404, 'File not found.');
        return;
      }

      console.error('Unable to read public file:', error);
      sendText(res, 500, 'Internal server error.');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8'
    };
    res.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(content);
  });
}

async function loadMovies() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  try {
    const contents = await fs.promises.readFile(MOVIES_FILE, 'utf8');
    const savedMovies = JSON.parse(contents);
    if (!Array.isArray(savedMovies)) {
      throw new Error('Movie data must be a JSON array.');
    }
    movies = savedMovies;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Unable to load movie data from ${MOVIES_FILE}: ${error.message}`);
    }

    movies = initialMovies;
    await persistMovies(movies);
  }
}

function persistMovies(updatedMovies) {
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const temporaryFile = `${MOVIES_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedMovies, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, MOVIES_FILE);
  });
  return saveQueue;
}

function appendMovie(movie) {
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    if (movies.some((existingMovie) => existingMovie.title.toLowerCase() === movie.title.toLowerCase())) {
      throw Object.assign(new Error('A movie with that title already exists.'), { statusCode: 409 });
    }

    const updatedMovies = [...movies, movie];
    const temporaryFile = `${MOVIES_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedMovies, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, MOVIES_FILE);
    movies = updatedMovies;
  });
  return saveQueue;
}

function getOptions() {
  return {
    genres: [...new Set(movies.flatMap((movie) => movie.genres))].sort(),
    moods: [...new Set(movies.map((movie) => movie.mood))].sort()
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
        tooLarge = true;
        body = '';
      }
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function getSessionToken(req) {
  const cookies = (req.headers.cookie || '').split(';');
  const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE}=`));
  return sessionCookie ? decodeURIComponent(sessionCookie.trim().slice(SESSION_COOKIE.length + 1)) : '';
}

function hasAdminSession(req) {
  const token = getSessionToken(req);
  const expiresAt = sessions.get(token);
  if (!expiresAt) {
    return false;
  }
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function constantTimeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

function normalizeString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateMovie(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Movie details must be a JSON object.' };
  }

  const title = normalizeString(payload.title, 120);
  const mood = normalizeString(payload.mood, 50);
  const director = normalizeString(payload.director, 120);
  const description = normalizeString(payload.description, 1000);
  const year = Number(payload.year);
  const rating = Number(payload.rating);
  const runtime = Number(payload.runtime);
  const genres = (Array.isArray(payload.genres) ? payload.genres : String(payload.genres || '').split(','))
    .map((genre) => normalizeString(genre, 40))
    .filter(Boolean);

  if (!title || !mood || !director || !description || genres.length === 0) {
    return { error: 'Enter a title, at least one genre, mood, director, and description.' };
  }
  if (!Number.isInteger(year) || year < 1888 || year > new Date().getFullYear() + 5) {
    return { error: 'Enter a valid release year.' };
  }
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    return { error: 'Rating must be between 0 and 10.' };
  }
  if (!Number.isInteger(runtime) || runtime < 1 || runtime > 600) {
    return { error: 'Runtime must be a whole number between 1 and 600 minutes.' };
  }

  return {
    movie: {
      title,
      genres: [...new Set(genres)],
      mood,
      year,
      rating,
      runtime,
      director,
      description
    }
  };
}

function recommendMovies(preferences = {}) {
  const favoriteGenre = normalizeString(preferences.favoriteGenre, 40);
  const mood = normalizeString(preferences.mood, 50);
  const minimumRating = Number(preferences.minimumRating) || 0;
  const includeLatest = Number(preferences.includeLatest) || 0;
  const maxRuntime = Number(preferences.maxRuntime) || 180;

  return [...movies]
    .map((movie) => {
      const genreMatch = movie.genres.includes(favoriteGenre) ? 5 : 0;
      const moodMatch = movie.mood.toLowerCase() === mood.toLowerCase() ? 4 : 0;
      const ratingBoost = movie.rating >= minimumRating ? 3 : 0;
      const recencyBoost = movie.year >= 2015 + includeLatest ? 2 : 0;
      const runtimeFit = movie.runtime <= maxRuntime ? 2 : 0;
      let score = genreMatch + moodMatch + ratingBoost + recencyBoost + runtimeFit;

      if (favoriteGenre && !movie.genres.includes(favoriteGenre)) score -= 1;
      if (mood && movie.mood.toLowerCase() !== mood.toLowerCase()) score -= 0.5;
      if (movie.rating < minimumRating) score -= 2;
      if (movie.runtime > maxRuntime) score -= 3;

      return { ...movie, score };
    })
    .filter((movie) => movie.rating >= minimumRating && movie.runtime <= maxRuntime)
    .sort((a, b) => b.score - a.score || b.rating - a.rating)
    .slice(0, 5);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendText(res, 400, 'Invalid request URL.');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    serveStaticFile(res, 'index.html');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/login') {
    serveStaticFile(res, 'login.html');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/admin') {
    if (!hasAdminSession(req)) {
      res.writeHead(302, { Location: '/login' });
      res.end();
      return;
    }
    serveStaticFile(res, 'admin.html');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/movies') {
    sendJson(res, 200, { movies, ...getOptions() });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    sendJson(res, 200, { authenticated: hasAdminSession(req) });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const payload = await readJsonBody(req);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        sendJson(res, 400, { error: 'Login details must be a JSON object.' });
        return;
      }
      const username = process.env.ADMIN_USERNAME;
      const password = process.env.ADMIN_PASSWORD;
      if (!username || !password) {
        sendJson(res, 503, {
          error: 'Admin account not set up. Copy .env.example to .env, choose a private ADMIN_PASSWORD, then restart the server.'
        });
        return;
      }
      if (
        !constantTimeEqual(String(payload.username || ''), username) ||
        !constantTimeEqual(String(payload.password || ''), password)
      ) {
        sendJson(res, 401, { error: 'Incorrect username or password.' });
        return;
      }

      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_DURATION_MS);
      setSessionCookie(res, token);
      sendJson(res, 200, { authenticated: true });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message || 'Unable to sign in.' });
    }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    sessions.delete(getSessionToken(req));
    clearSessionCookie(res);
    sendJson(res, 200, { authenticated: false });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/recommend') {
    try {
      const payload = await readJsonBody(req);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        sendJson(res, 400, { error: 'Recommendation preferences must be a JSON object.' });
        return;
      }
      sendJson(res, 200, { recommendations: recommendMovies(payload) });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message || 'Unable to get recommendations.' });
    }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/movies') {
    if (!hasAdminSession(req)) {
      sendJson(res, 401, { error: 'Admin sign-in required.' });
      return;
    }

    try {
      const payload = await readJsonBody(req);
      const result = validateMovie(payload);
      if (result.error) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      await appendMovie(result.movie);
      sendJson(res, 201, { movie: result.movie });
    } catch (error) {
      if (error.statusCode !== 409) {
        console.error('Unable to save a new movie:', error);
      }
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Unable to save the movie. Check the server log.'
      });
    }
    return;
  }

  const publicFiles = new Map([
    ['/styles.css', 'styles.css'],
    ['/app.js', 'app.js'],
    ['/login.js', 'login.js'],
    ['/admin.js', 'admin.js']
  ]);
  if (req.method === 'GET' && publicFiles.has(url.pathname)) {
    serveStaticFile(res, publicFiles.get(url.pathname));
    return;
  }

  sendText(res, 404, 'Not found.');
});

loadMovies()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Film recommendation system is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
