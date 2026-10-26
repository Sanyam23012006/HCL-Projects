const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { promisify } = require('util');

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
const RECOMMENDER_FILE = path.join(__dirname, 'recommend.py');
const DATA_DIR = path.join(__dirname, 'data');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const SESSION_COOKIE = 'film_admin_session';
const USER_SESSION_COOKIE = 'film_user_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 16 * 1024;
const PASSWORD_HASH_BYTES = 64;
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
const userSessions = new Map();

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
let users = [];
let userSaveQueue = Promise.resolve();
let reviews = [];
let reviewSaveQueue = Promise.resolve();

function defaultPreferences() {
  return { favoriteGenres: [], favoriteMoods: [], minimumRating: 7.5 };
}

function getPublicMovie(movie, userId) {
  return {
    ...movie,
    ...getMovieReviewData(movie.id, userId),
    inWatchlist: Boolean(userId && users.find((user) => user.id === userId)?.watchlist?.includes(movie.id))
  };
}

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
    if (savedMovies.some((movie) => !movie || typeof movie !== 'object' || Array.isArray(movie))) {
      throw new Error('Every movie in the data file must be a JSON object.');
    }

    const movieIds = new Set();
    let needsSave = false;
    movies = savedMovies.map((movie) => {
      let id = movie.id;
      if (typeof id !== 'string' || !id || movieIds.has(id)) {
        id = crypto.randomUUID();
        needsSave = true;
      }
      movieIds.add(id);
      return { ...movie, id };
    });
    if (needsSave) {
      await persistMovies(movies);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Unable to load movie data from ${MOVIES_FILE}: ${error.message}`);
    }

    movies = initialMovies.map((movie) => ({ ...movie, id: crypto.randomUUID() }));
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

    const movieWithId = { ...movie, id: crypto.randomUUID() };
    const updatedMovies = [...movies, movieWithId];
    const temporaryFile = `${MOVIES_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedMovies, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, MOVIES_FILE);
    movies = updatedMovies;
    return movieWithId;
  });
  return saveQueue;
}

async function loadUsers() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  try {
    const contents = await fs.promises.readFile(USERS_FILE, 'utf8');
    const savedUsers = JSON.parse(contents);
    if (!Array.isArray(savedUsers)) {
      throw new Error('User data must be a JSON array.');
    }
    if (savedUsers.some((user) =>
      !user || typeof user !== 'object' || Array.isArray(user) ||
      typeof user.email !== 'string' || typeof user.passwordSalt !== 'string' ||
      typeof user.passwordHash !== 'string'
    )) {
      throw new Error('Every user entry must contain valid account data.');
    }

    const userIds = new Set();
    let needsSave = false;
    users = savedUsers.map((user) => {
      let id = user.id;
      if (typeof id !== 'string' || !id || userIds.has(id)) {
        id = crypto.randomUUID();
        needsSave = true;
      }
      userIds.add(id);
      if (!user.preferences || typeof user.preferences !== 'object' || Array.isArray(user.preferences)) {
        needsSave = true;
      }
      if (!Array.isArray(user.watchlist)) {
        needsSave = true;
      }
      return {
        ...user,
        id,
        watchlist: Array.isArray(user.watchlist) ? [...new Set(user.watchlist.filter((movieId) => typeof movieId === 'string'))] : [],
        preferences: { ...defaultPreferences(), ...user.preferences }
      };
    });
    if (needsSave) {
      await persistUsers(users);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Unable to load user data from ${USERS_FILE}: ${error.message}`);
    }
    users = [];
    await persistUsers(users);
  }
}

function validateReviewData(reviews) {
  if (!Array.isArray(reviews)) {
    throw new Error('Review data must be a JSON array.');
  }

  const reviewKeys = new Set();
  for (const review of reviews) {
    if (
      !review || typeof review !== 'object' || Array.isArray(review) ||
      typeof review.id !== 'string' || !review.id ||
      typeof review.movieId !== 'string' || typeof review.userId !== 'string' ||
      typeof review.userName !== 'string' ||
      !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 10 ||
      typeof review.text !== 'string' ||
      typeof review.createdAt !== 'string' || typeof review.updatedAt !== 'string'
    ) {
      throw new Error('Every review entry must contain valid review data.');
    }
    const key = `${review.movieId}:${review.userId}`;
    if (reviewKeys.has(key)) {
      throw new Error('A user may only have one review per movie.');
    }
    reviewKeys.add(key);
  }
}

async function loadReviews() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  try {
    const contents = await fs.promises.readFile(REVIEWS_FILE, 'utf8');
    const savedReviews = JSON.parse(contents);
    validateReviewData(savedReviews);
    reviews = savedReviews;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Unable to load review data from ${REVIEWS_FILE}: ${error.message}`);
    }
    reviews = [];
    await persistReviews(reviews);
  }
}

function persistUsers(updatedUsers) {
  userSaveQueue = userSaveQueue.catch(() => {}).then(async () => {
    const temporaryFile = `${USERS_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedUsers, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, USERS_FILE);
  });
  return userSaveQueue;
}

function persistReviews(updatedReviews) {
  reviewSaveQueue = reviewSaveQueue.catch(() => {}).then(async () => {
    const temporaryFile = `${REVIEWS_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedReviews, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, REVIEWS_FILE);
  });
  return reviewSaveQueue;
}

function getMovieReviewData(movieId, currentUserId) {
  const movieReviews = reviews
    .filter((review) => review.movieId === movieId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const averageRating = movieReviews.length
    ? Number((movieReviews.reduce((sum, review) => sum + review.rating, 0) / movieReviews.length).toFixed(1))
    : null;
  const ownReview = currentUserId
    ? movieReviews.find((review) => review.userId === currentUserId)
    : null;

  return {
    communityRating: averageRating,
    reviewCount: movieReviews.length,
    reviews: movieReviews.slice(0, 3).map((review) => ({
      name: review.userName,
      rating: review.rating,
      text: review.text,
      createdAt: review.createdAt
    })),
    myReview: ownReview
      ? { rating: ownReview.rating, text: ownReview.text, createdAt: ownReview.createdAt }
      : null
  };
}

function validateReview(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Review details must be a JSON object.' };
  }

  const rating = Number(payload.rating);
  const text = normalizeString(payload.text, 1000);
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return { error: 'Choose a rating from 1 to 10.' };
  }
  if (text.length < 3) {
    return { error: 'Write a review of at least 3 characters.' };
  }

  return { rating, text };
}

function saveMovieReview(movieId, user, reviewDetails, updateExisting) {
  reviewSaveQueue = reviewSaveQueue.catch(() => {}).then(async () => {
    const existingIndex = reviews.findIndex((review) =>
      review.movieId === movieId && review.userId === user.id
    );
    if (existingIndex !== -1 && !updateExisting) {
      throw Object.assign(new Error('You have already reviewed this movie. Edit your existing review instead.'), {
        statusCode: 409
      });
    }
    if (existingIndex === -1 && updateExisting) {
      throw Object.assign(new Error('You do not have a review for this movie to edit.'), { statusCode: 404 });
    }

    const now = new Date().toISOString();
    const review = {
      id: existingIndex === -1 ? crypto.randomUUID() : reviews[existingIndex].id,
      movieId,
      userId: user.id,
      userName: user.name,
      rating: reviewDetails.rating,
      text: reviewDetails.text,
      createdAt: existingIndex === -1 ? now : reviews[existingIndex].createdAt,
      updatedAt: now
    };
    const updatedReviews = [...reviews];
    if (existingIndex === -1) {
      updatedReviews.push(review);
    } else {
      updatedReviews[existingIndex] = review;
    }
    validateReviewData(updatedReviews);
    const temporaryFile = `${REVIEWS_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedReviews, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, REVIEWS_FILE);
    reviews = updatedReviews;
    return review;
  });
  return reviewSaveQueue;
}

async function registerUser(account) {
  userSaveQueue = userSaveQueue.catch(() => {}).then(async () => {
    if (users.some((user) => user.email === account.email)) {
      throw Object.assign(new Error('An account with this email already exists.'), { statusCode: 409 });
    }
    const savedAccount = { ...account, id: crypto.randomUUID() };
    const updatedUsers = [...users, savedAccount];
    const temporaryFile = `${USERS_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedUsers, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, USERS_FILE);
    users = updatedUsers;
    return savedAccount;
  });
  return userSaveQueue;
}

function validatePreferences(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Preferences must be a JSON object.' };
  }

  const { genres, moods } = getOptions();
  const favoriteGenres = payload.favoriteGenres;
  const favoriteMoods = payload.favoriteMoods;
  const minimumRating = Number(payload.minimumRating);

  if (!Array.isArray(favoriteGenres) || favoriteGenres.length > genres.length ||
      favoriteGenres.some((genre) => typeof genre !== 'string' || !genres.includes(genre))) {
    return { error: 'Choose favorite genres from the movie library.' };
  }
  if (!Array.isArray(favoriteMoods) || favoriteMoods.length > moods.length ||
      favoriteMoods.some((mood) => typeof mood !== 'string' || !moods.includes(mood))) {
    return { error: 'Choose favorite moods from the movie library.' };
  }
  if (!Number.isFinite(minimumRating) || minimumRating < 0 || minimumRating > 10) {
    return { error: 'Minimum rating must be between 0 and 10.' };
  }

  return {
    preferences: {
      favoriteGenres: [...new Set(favoriteGenres)],
      favoriteMoods: [...new Set(favoriteMoods)],
      minimumRating
    }
  };
}

function updateUserPreferences(userId, preferences) {
  userSaveQueue = userSaveQueue.catch(() => {}).then(async () => {
    const userIndex = users.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      throw Object.assign(new Error('User account not found.'), { statusCode: 404 });
    }

    const updatedUsers = [...users];
    const updatedUser = { ...updatedUsers[userIndex], preferences };
    updatedUsers[userIndex] = updatedUser;
    const temporaryFile = `${USERS_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedUsers, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, USERS_FILE);
    users = updatedUsers;
    return updatedUser;
  });
  return userSaveQueue;
}

function updateUserWatchlist(userId, movieId, addMovie) {
  userSaveQueue = userSaveQueue.catch(() => {}).then(async () => {
    const userIndex = users.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      throw Object.assign(new Error('User account not found.'), { statusCode: 404 });
    }

    const currentUser = users[userIndex];
    const watchlist = new Set(currentUser.watchlist || []);
    if (addMovie) {
      watchlist.add(movieId);
    } else {
      watchlist.delete(movieId);
    }
    const updatedUsers = [...users];
    const updatedUser = { ...currentUser, watchlist: [...watchlist] };
    updatedUsers[userIndex] = updatedUser;
    const temporaryFile = `${USERS_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedUsers, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, USERS_FILE);
    users = updatedUsers;
    return updatedUser;
  });
  return userSaveQueue;
}

function replaceMovie(movieId, updatedMovie) {
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const movieIndex = movies.findIndex((movie) => movie.id === movieId);
    if (movieIndex === -1) {
      throw Object.assign(new Error('Movie not found.'), { statusCode: 404 });
    }
    if (movies.some((movie) =>
      movie.id !== movieId && movie.title.toLowerCase() === updatedMovie.title.toLowerCase()
    )) {
      throw Object.assign(new Error('A movie with that title already exists.'), { statusCode: 409 });
    }

    const savedMovie = { ...updatedMovie, id: movieId };
    const updatedMovies = [...movies];
    updatedMovies[movieIndex] = savedMovie;
    const temporaryFile = `${MOVIES_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedMovies, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, MOVIES_FILE);
    movies = updatedMovies;
    return savedMovie;
  });
  return saveQueue;
}

function removeMovie(movieId) {
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const movie = movies.find((item) => item.id === movieId);
    if (!movie) {
      throw Object.assign(new Error('Movie not found.'), { statusCode: 404 });
    }

    const updatedMovies = movies.filter((item) => item.id !== movieId);
    const temporaryFile = `${MOVIES_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, `${JSON.stringify(updatedMovies, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporaryFile, MOVIES_FILE);
    movies = updatedMovies;
    return movie;
  });
  return saveQueue;
}

function getOptions() {
  return {
    genres: [...new Set(movies.flatMap((movie) => movie.genres))].sort(),
    moods: [...new Set(movies.map((movie) => movie.mood))].sort()
  };
}

function searchCatalog(url, userId) {
  const query = normalizeString(url.searchParams.get('q'), 120).toLowerCase();
  const genre = normalizeString(url.searchParams.get('genre'), 40);
  const ratingParam = url.searchParams.get('minimumRating');
  const yearFromParam = url.searchParams.get('yearFrom');
  const yearToParam = url.searchParams.get('yearTo');
  const minimumRating = ratingParam
    ? Number(url.searchParams.get('minimumRating'))
    : 0;
  const yearFrom = yearFromParam ? Number(yearFromParam) : null;
  const yearTo = yearToParam ? Number(yearToParam) : null;

  if (!Number.isFinite(minimumRating) || minimumRating < 0 || minimumRating > 10) {
    return { error: 'Minimum rating must be between 0 and 10.' };
  }
  if ((yearFrom !== null && (!Number.isInteger(yearFrom) || yearFrom < 1888)) ||
      (yearTo !== null && (!Number.isInteger(yearTo) || yearTo < 1888)) ||
      (yearFrom !== null && yearTo !== null && yearFrom > yearTo)) {
    return { error: 'Enter a valid release-year range.' };
  }
  if (genre && !getOptions().genres.includes(genre)) {
    return { error: 'Choose a genre from the movie catalog.' };
  }

  const filteredMovies = movies
    .filter((movie) =>
      (!query || `${movie.title} ${movie.director} ${movie.description}`.toLowerCase().includes(query)) &&
      (!genre || movie.genres.includes(genre)) &&
      movie.rating >= minimumRating &&
      (yearFrom === null || movie.year >= yearFrom) &&
      (yearTo === null || movie.year <= yearTo)
    )
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((movie) => getPublicMovie(movie, userId));

  return { movies: filteredMovies, ...getOptions() };
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

function getSessionToken(req, cookieName = SESSION_COOKIE) {
  const cookies = (req.headers.cookie || '').split(';');
  const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith(`${cookieName}=`));
  return sessionCookie ? sessionCookie.trim().slice(cookieName.length + 1) : '';
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

function setSessionCookie(res, token, cookieName = SESSION_COOKIE) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}${secure}`
  );
}

function clearSessionCookie(res, cookieName = SESSION_COOKIE) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

function getUserFromSession(req) {
  const token = getSessionToken(req, USER_SESSION_COOKIE);
  const session = userSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    userSessions.delete(token);
    return null;
  }
  return users.find((user) => user.id === session.userId) || null;
}

function getPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    watchlist: user.watchlist || [],
    preferences: { ...defaultPreferences(), ...user.preferences }
  };
}

function createUserSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  userSessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_DURATION_MS });
  setSessionCookie(res, token, USER_SESSION_COOKIE);
}

function validateRegistration(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Account details must be a JSON object.' };
  }

  const name = normalizeString(payload.name, 60);
  const email = normalizeString(payload.email, 254).toLowerCase();
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (name.length < 2) {
    return { error: 'Name must be at least 2 characters.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (password.length < 10 || password.length > 128) {
    return { error: 'Password must be between 10 and 128 characters.' };
  }

  return { name, email, password };
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, PASSWORD_HASH_BYTES, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return { salt, hash: hash.toString('hex') };
}

async function passwordMatches(password, user) {
  if (!/^[a-f0-9]{32}$/i.test(user.passwordSalt) ||
      !/^[a-f0-9]{128}$/i.test(user.passwordHash)) {
    return false;
  }
  const { hash } = await hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
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
  const posterUrl = normalizeString(payload.posterUrl, 2048);
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
  if (posterUrl) {
    try {
      const parsedPosterUrl = new URL(posterUrl);
      if (!['http:', 'https:'].includes(parsedPosterUrl.protocol) ||
          !parsedPosterUrl.hostname || parsedPosterUrl.username || parsedPosterUrl.password) {
        return { error: 'Poster URL must be a valid HTTP or HTTPS image URL.' };
      }
    } catch {
      return { error: 'Poster URL must be a valid HTTP or HTTPS image URL.' };
    }
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
      description,
      posterUrl
    }
  };
}

function getPythonExecutable() {
  return process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
}

function getMlRecommendations(payload) {
  return new Promise((resolve, reject) => {
    const python = spawn(getPythonExecutable(), [RECOMMENDER_FILE], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let outputTooLarge = false;

    python.stdout.setEncoding('utf8');
    python.stderr.setEncoding('utf8');
    python.stdout.on('data', (chunk) => {
      if (outputTooLarge) return;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > 1024 * 1024) {
        outputTooLarge = true;
        python.kill();
        return;
      }
      stdout += chunk;
    });
    python.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    python.on('error', (error) => {
      reject(Object.assign(new Error(`Unable to start the Python recommender: ${error.message}`), { statusCode: 503 }));
    });
    python.on('close', (code) => {
      if (outputTooLarge) {
        reject(Object.assign(new Error('The Python recommender returned too much data.'), { statusCode: 503 }));
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim();
        reject(Object.assign(
          new Error(detail
            ? `The Python recommender failed: ${detail}`
            : 'The Python recommender failed. Check that its dependencies are installed.'),
          { statusCode: 503 }
        ));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (!Array.isArray(result.recommendations)) {
          throw new Error('The Python recommender returned an invalid response.');
        }
        resolve(result.recommendations);
      } catch (error) {
        reject(Object.assign(new Error(`Unable to read the Python recommender response: ${error.message}`), { statusCode: 503 }));
      }
    });

    python.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') {
        console.error('Unable to send input to the Python recommender:', error);
      }
    });
    python.stdin.end(JSON.stringify(payload));
  });
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
  if (req.method === 'GET' && url.pathname === '/signup') {
    serveStaticFile(res, 'signup.html');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/user-login') {
    serveStaticFile(res, 'user-login.html');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/preferences') {
    serveStaticFile(res, 'preferences.html');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/browse') {
    serveStaticFile(res, 'browse.html');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/watchlist') {
    serveStaticFile(res, 'watchlist.html');
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
  if (req.method === 'GET' && url.pathname === '/api/catalog') {
    const user = getUserFromSession(req);
    const result = searchCatalog(url, user?.id);
    if (result.error) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    sendJson(res, 200, { authenticated: hasAdminSession(req) });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/user/session') {
    const user = getUserFromSession(req);
    sendJson(res, 200, { authenticated: Boolean(user), user: user ? getPublicUser(user) : null });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/user/preferences') {
    const user = getUserFromSession(req);
    if (!user) {
      sendJson(res, 401, { error: 'User sign-in required.' });
      return;
    }
    sendJson(res, 200, { preferences: { ...defaultPreferences(), ...user.preferences } });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/user/watchlist') {
    const user = getUserFromSession(req);
    if (!user) {
      sendJson(res, 401, { error: 'User sign-in required.' });
      return;
    }
    const watchlistMovies = (user.watchlist || [])
      .map((movieId) => movies.find((movie) => movie.id === movieId))
      .filter(Boolean)
      .map((movie) => getPublicMovie(movie, user.id));
    sendJson(res, 200, { movies: watchlistMovies });
    return;
  }
  const watchlistRoute = url.pathname.match(/^\/api\/user\/watchlist\/([a-f0-9-]+)$/i);
  if (watchlistRoute && (req.method === 'POST' || req.method === 'DELETE')) {
    const user = getUserFromSession(req);
    if (!user) {
      sendJson(res, 401, { error: 'User sign-in required.' });
      return;
    }
    const movieId = watchlistRoute[1];
    if (!movies.some((movie) => movie.id === movieId)) {
      sendJson(res, 404, { error: 'Movie not found.' });
      return;
    }

    try {
      const updatedUser = await updateUserWatchlist(user.id, movieId, req.method === 'POST');
      const movie = movies.find((item) => item.id === movieId);
      sendJson(res, 200, { inWatchlist: updatedUser.watchlist.includes(movieId), movie: getPublicMovie(movie, user.id) });
    } catch (error) {
      console.error('Unable to update user watchlist:', error);
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Unable to update your watchlist. Check the server log.'
      });
    }
    return;
  }
  if (req.method === 'PUT' && url.pathname === '/api/user/preferences') {
    const user = getUserFromSession(req);
    if (!user) {
      sendJson(res, 401, { error: 'User sign-in required.' });
      return;
    }

    try {
      const payload = await readJsonBody(req);
      const result = validatePreferences(payload);
      if (result.error) {
        sendJson(res, 400, { error: result.error });
        return;
      }

      const updatedUser = await updateUserPreferences(user.id, result.preferences);
      sendJson(res, 200, { preferences: updatedUser.preferences });
    } catch (error) {
      if (error.statusCode !== 404) {
        console.error('Unable to save user preferences:', error);
      }
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Unable to save preferences. Check the server log.'
      });
    }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/user/register') {
    try {
      const payload = await readJsonBody(req);
      const registration = validateRegistration(payload);
      if (registration.error) {
        sendJson(res, 400, { error: registration.error });
        return;
      }

      const { salt, hash } = await hashPassword(registration.password);
      const user = await registerUser({
        name: registration.name,
        email: registration.email,
        passwordSalt: salt,
        passwordHash: hash,
        watchlist: [],
        preferences: defaultPreferences(),
        createdAt: new Date().toISOString()
      });
      createUserSession(res, user);
      sendJson(res, 201, { authenticated: true, user: getPublicUser(user) });
    } catch (error) {
      if (error.statusCode !== 409) {
        console.error('Unable to register user:', error);
      }
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Unable to create the account. Check the server log.'
      });
    }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/user/login') {
    try {
      const payload = await readJsonBody(req);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        sendJson(res, 400, { error: 'Login details must be a JSON object.' });
        return;
      }

      const email = normalizeString(payload.email, 254).toLowerCase();
      const password = typeof payload.password === 'string' ? payload.password : '';
      const user = users.find((account) => account.email === email);
      if (!user || password.length > 128 || !await passwordMatches(password, user)) {
        sendJson(res, 401, { error: 'Incorrect email or password.' });
        return;
      }

      createUserSession(res, user);
      sendJson(res, 200, { authenticated: true, user: getPublicUser(user) });
    } catch (error) {
      console.error('Unable to sign in user:', error);
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Unable to sign in. Check the server log.'
      });
    }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/user/logout') {
    userSessions.delete(getSessionToken(req, USER_SESSION_COOKIE));
    clearSessionCookie(res, USER_SESSION_COOKIE);
    sendJson(res, 200, { authenticated: false, user: null });
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
      const user = getUserFromSession(req);
      const mlRecommendations = await getMlRecommendations({
        movies,
        preferences: payload,
        watchlist: user?.watchlist || [],
        ratings: user
          ? reviews
            .filter((review) => review.userId === user.id)
            .map((review) => ({ movieId: review.movieId, rating: review.rating }))
          : []
      });
      const movieById = new Map(movies.map((movie) => [movie.id, movie]));
      const recommendations = mlRecommendations
        .map((recommendation) => {
          const movie = movieById.get(recommendation.id);
          if (!movie) return null;
          return {
            ...movie,
            score: recommendation.score,
            reasons: recommendation.reasons,
            ...getMovieReviewData(movie.id, user?.id),
            inWatchlist: Boolean(user && user.watchlist?.includes(movie.id))
          };
        })
        .filter(Boolean);
      sendJson(res, 200, { recommendations });
    } catch (error) {
      if (error.statusCode === 503) {
        console.error('Unable to generate ML recommendations:', error);
      }
      sendJson(res, error.statusCode || 400, { error: error.message || 'Unable to get recommendations.' });
    }
    return;
  }
  const reviewRoute = url.pathname.match(/^\/api\/movies\/([a-f0-9-]+)\/reviews$/i);
  if (reviewRoute && req.method === 'GET') {
    const movieId = reviewRoute[1];
    if (!movies.some((movie) => movie.id === movieId)) {
      sendJson(res, 404, { error: 'Movie not found.' });
      return;
    }

    const user = getUserFromSession(req);
    sendJson(res, 200, getMovieReviewData(movieId, user?.id));
    return;
  }
  if (reviewRoute && (req.method === 'POST' || req.method === 'PUT')) {
    const user = getUserFromSession(req);
    if (!user) {
      sendJson(res, 401, { error: 'User sign-in required to review movies.' });
      return;
    }
    const movieId = reviewRoute[1];
    if (!movies.some((movie) => movie.id === movieId)) {
      sendJson(res, 404, { error: 'Movie not found.' });
      return;
    }

    try {
      const payload = await readJsonBody(req);
      const result = validateReview(payload);
      if (result.error) {
        sendJson(res, 400, { error: result.error });
        return;
      }

      const review = await saveMovieReview(movieId, user, result, req.method === 'PUT');
      sendJson(res, req.method === 'POST' ? 201 : 200, {
        review: {
          rating: review.rating,
          text: review.text,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt
        },
        ...getMovieReviewData(movieId, user.id)
      });
    } catch (error) {
      if (error.statusCode !== 404 && error.statusCode !== 409) {
        console.error('Unable to save movie review:', error);
      }
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Unable to save your review. Check the server log.'
      });
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
      const movie = await appendMovie(result.movie);
      sendJson(res, 201, { movie });
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
  const movieRoute = url.pathname.match(/^\/api\/movies\/([a-f0-9-]+)$/i);
  if (movieRoute && (req.method === 'PUT' || req.method === 'DELETE')) {
    if (!hasAdminSession(req)) {
      sendJson(res, 401, { error: 'Admin sign-in required.' });
      return;
    }

    try {
      const movieId = movieRoute[1];
      if (req.method === 'DELETE') {
        const movie = await removeMovie(movieId);
        sendJson(res, 200, { movie });
        return;
      }

      const payload = await readJsonBody(req);
      const result = validateMovie(payload);
      if (result.error) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      const movie = await replaceMovie(movieId, result.movie);
      sendJson(res, 200, { movie });
    } catch (error) {
      if (error.statusCode !== 404 && error.statusCode !== 409) {
        console.error(`Unable to ${req.method === 'DELETE' ? 'delete' : 'update'} movie:`, error);
      }
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Unable to save movie changes. Check the server log.'
      });
    }
    return;
  }

  const publicFiles = new Map([
    ['/styles.css', 'styles.css'],
    ['/app.js', 'app.js'],
    ['/login.js', 'login.js'],
    ['/admin.js', 'admin.js'],
    ['/user-auth.js', 'user-auth.js'],
    ['/preferences.js', 'preferences.js'],
    ['/library.js', 'library.js']
  ]);
  if (req.method === 'GET' && publicFiles.has(url.pathname)) {
    serveStaticFile(res, publicFiles.get(url.pathname));
    return;
  }

  sendText(res, 404, 'Not found.');
});

Promise.all([loadMovies(), loadUsers(), loadReviews()])
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Film recommendation system is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
