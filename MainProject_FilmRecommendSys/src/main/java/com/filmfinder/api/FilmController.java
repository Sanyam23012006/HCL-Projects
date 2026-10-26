package com.filmfinder.api;

import com.filmfinder.model.AppMovie;
import com.filmfinder.model.AppUser;
import com.filmfinder.repository.AppMovieRepository;
import com.filmfinder.service.FilmService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Controller
public class FilmController {
    private final FilmService filmService;
    private final AppMovieRepository movieRepository;

    public FilmController(FilmService filmService, AppMovieRepository movieRepository) {
        this.filmService = filmService;
        this.movieRepository = movieRepository;
    }

    @GetMapping({"/", "/index.html"})
    public String home() { return "forward:/index.html"; }
    @GetMapping("/login")
    public String adminLoginPage() { return "forward:/login.html"; }
    @GetMapping("/signup")
    public String signupPage() { return "forward:/signup.html"; }
    @GetMapping("/user-login")
    public String userLoginPage() { return "forward:/user-login.html"; }
    @GetMapping("/preferences")
    public String preferencesPage() { return "forward:/preferences.html"; }
    @GetMapping("/browse")
    public String browsePage() { return "forward:/browse.html"; }
    @GetMapping("/watchlist")
    public String watchlistPage() { return "forward:/watchlist.html"; }
    @GetMapping("/admin")
    public String adminPage(HttpServletRequest request) {
        if (!filmService.isAdmin(request)) return "redirect:/login";
        return "forward:/admin.html";
    }

    @GetMapping("/api/health")
    @ResponseBody
    public Map<String, String> health() { return Map.of("status", "ok"); }

    @GetMapping("/api/movies")
    @ResponseBody
    public Map<String, Object> appMovies() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("movies", filmService.appMovies());
        result.putAll(filmService.appMovieOptions());
        return result;
    }

    @GetMapping("/api/recommendation-options")
    @ResponseBody
    public Map<String, Object> recommendationOptions() {
        return Map.of("genres", filmService.datasetGenres(), "languages", filmService.datasetLanguages());
    }

    @GetMapping("/api/dataset-movies")
    @ResponseBody
    public Map<String, Object> datasetMovies(@RequestParam Map<String, String> filters) {
        return Map.of("movies", filmService.datasetMovies(filters), "genres", filmService.datasetGenres());
    }

    @PostMapping("/api/admin/dataset-movies")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> addDatasetMovie(@RequestBody Map<String, Object> payload,
                                                                HttpServletRequest request) {
        requireAdmin(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("movie", filmService.addDatasetMovie(payload)));
    }

    @PutMapping("/api/admin/dataset-movies/{id}")
    @ResponseBody
    public Map<String, Object> updateDatasetMovie(@PathVariable String id,
                                                   @RequestBody Map<String, Object> payload,
                                                   HttpServletRequest request) {
        requireAdmin(request);
        return Map.of("movie", filmService.updateDatasetMovie(id, payload));
    }

    @DeleteMapping("/api/admin/dataset-movies/{id}")
    @ResponseBody
    public Map<String, Object> deleteDatasetMovie(@PathVariable String id, HttpServletRequest request) {
        requireAdmin(request);
        return Map.of("movie", filmService.deleteDatasetMovie(id));
    }

    @GetMapping("/api/catalog")
    @ResponseBody
    public Map<String, Object> appCatalog(@RequestParam Map<String, String> filters,
                                          HttpServletRequest request) {
        String query = filters.getOrDefault("q", "").trim().toLowerCase();
        String genre = filters.getOrDefault("genre", "");
        double minimumRating = parseFilterRating(filters.get("minimumRating"));
        Integer yearFrom = parseFilterYear(filters.get("yearFrom"));
        Integer yearTo = parseFilterYear(filters.get("yearTo"));
        if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid release-year range.");
        }
        String userId = currentUser(request) == null ? null : currentUser(request).id;
        List<Map<String, Object>> filtered = movieRepository.findAll().stream()
                .filter(movie -> query.isEmpty() || (movie.title + " " + movie.director + " " + movie.description)
                        .toLowerCase().contains(query))
                .filter(movie -> genre.isEmpty() || filmService.movieGenres(movie).contains(genre))
                .filter(movie -> movie.rating >= minimumRating)
                .filter(movie -> yearFrom == null || movie.year >= yearFrom)
                .filter(movie -> yearTo == null || movie.year <= yearTo)
                .sorted((first, second) -> first.title.compareToIgnoreCase(second.title))
                .map(movie -> filmService.publicMovie(movie, userId))
                .toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("movies", filtered);
        result.putAll(filmService.appMovieOptions());
        return result;
    }

    @GetMapping("/api/session")
    @ResponseBody
    public Map<String, Boolean> adminSession(HttpServletRequest request) {
        return Map.of("authenticated", filmService.isAdmin(request));
    }

    @PostMapping("/api/login")
    @ResponseBody
    public Map<String, Boolean> adminLogin(@RequestBody Map<String, Object> payload, HttpServletRequest request) {
        filmService.authenticateAdmin(payload, request);
        return Map.of("authenticated", true);
    }

    @PostMapping("/api/logout")
    @ResponseBody
    public Map<String, Boolean> adminLogout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.removeAttribute("adminAuthenticated");
        return Map.of("authenticated", false);
    }

    @GetMapping("/api/user/session")
    @ResponseBody
    public Map<String, Object> userSession(HttpServletRequest request) {
        AppUser user = currentUser(request);
        return Map.of("authenticated", user != null, "user", user == null ? Map.of() : filmService.publicUser(user));
    }

    @PostMapping("/api/user/register")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, Object> payload,
                                                         HttpServletRequest request) {
        Map<String, Object> user = filmService.registerUser(payload);
        request.getSession(true).setAttribute("userId", user.get("id"));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("authenticated", true, "user", user));
    }

    @PostMapping("/api/user/login")
    @ResponseBody
    public Map<String, Object> userLogin(@RequestBody Map<String, Object> payload, HttpServletRequest request) {
        Map<String, Object> user = filmService.authenticateUser(payload);
        request.getSession(true).setAttribute("userId", user.get("id"));
        return Map.of("authenticated", true, "user", user);
    }

    @PostMapping("/api/user/logout")
    @ResponseBody
    public Map<String, Object> userLogout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.removeAttribute("userId");
        return Map.of("authenticated", false, "user", Map.of());
    }

    @GetMapping("/api/user/preferences")
    @ResponseBody
    public Map<String, Object> getPreferences(HttpServletRequest request) {
        AppUser user = requireUser(request);
        return Map.of("preferences", filmService.publicUser(user).get("preferences"));
    }

    @PutMapping("/api/user/preferences")
    @ResponseBody
    public Map<String, Object> updatePreferences(@RequestBody Map<String, Object> payload,
                                                 HttpServletRequest request) {
        return Map.of("preferences", filmService.savePreferences(requireUser(request), payload));
    }

    @GetMapping("/api/user/watchlist")
    @ResponseBody
    public Map<String, Object> watchlist(HttpServletRequest request) {
        return Map.of("movies", filmService.watchlist(requireUser(request)));
    }

    @PostMapping("/api/user/watchlist/{movieId}")
    @ResponseBody
    public Map<String, Object> addToWatchlist(@PathVariable String movieId, HttpServletRequest request) {
        return watchlistUpdate(movieId, true, request);
    }

    @DeleteMapping("/api/user/watchlist/{movieId}")
    @ResponseBody
    public Map<String, Object> removeFromWatchlist(@PathVariable String movieId, HttpServletRequest request) {
        return watchlistUpdate(movieId, false, request);
    }

    private Map<String, Object> watchlistUpdate(String movieId, boolean add, HttpServletRequest request) {
        AppUser user = requireUser(request);
        filmService.updateWatchlist(user, movieId, add);
        AppMovie movie = movieRepository.findById(movieId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movie not found."));
        return Map.of("inWatchlist", add, "movie", filmService.publicMovie(movie, user.id));
    }

    @PostMapping("/api/recommend")
    @ResponseBody
    public Map<String, Object> recommend(@RequestBody Map<String, Object> preferences,
                                         HttpServletRequest request) {
        AppUser user = currentUser(request);
        int datasetUserId = user == null ? 10000 : 10000 + Math.floorMod(user.id.hashCode(), 300);
        return Map.of("recommendations", filmService.recommendations(datasetUserId, preferences));
    }

    @GetMapping("/api/movies/{movieId}/reviews")
    @ResponseBody
    public Map<String, Object> getReviews(@PathVariable String movieId, HttpServletRequest request) {
        if (!movieRepository.existsById(movieId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Movie not found.");
        AppUser user = currentUser(request);
        return filmService.movieReviewData(movieId, user == null ? null : user.id);
    }

    @PostMapping("/api/movies/{movieId}/reviews")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> createReview(@PathVariable String movieId,
                                                             @RequestBody Map<String, Object> payload,
                                                             HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(filmService.saveReview(movieId, requireUser(request), payload, false));
    }

    @PutMapping("/api/movies/{movieId}/reviews")
    @ResponseBody
    public Map<String, Object> updateReview(@PathVariable String movieId,
                                            @RequestBody Map<String, Object> payload,
                                            HttpServletRequest request) {
        return filmService.saveReview(movieId, requireUser(request), payload, true);
    }

    @PostMapping("/api/movies")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> createAppMovie(@RequestBody Map<String, Object> payload,
                                                               HttpServletRequest request) {
        requireAdmin(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("movie", filmService.adminSaveMovie(null, payload)));
    }

    @PutMapping("/api/movies/{movieId}")
    @ResponseBody
    public Map<String, Object> updateAppMovie(@PathVariable String movieId,
                                               @RequestBody Map<String, Object> payload,
                                               HttpServletRequest request) {
        requireAdmin(request);
        return Map.of("movie", filmService.adminSaveMovie(movieId, payload));
    }

    @DeleteMapping("/api/movies/{movieId}")
    @ResponseBody
    public Map<String, Object> deleteAppMovie(@PathVariable String movieId, HttpServletRequest request) {
        requireAdmin(request);
        return Map.of("movie", filmService.deleteAppMovie(movieId));
    }

    private AppUser currentUser(HttpServletRequest request) { return filmService.currentUser(request); }
    private AppUser requireUser(HttpServletRequest request) {
        AppUser user = currentUser(request);
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User sign-in required.");
        return user;
    }
    private void requireAdmin(HttpServletRequest request) {
        if (!filmService.isAdmin(request)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Admin sign-in required.");
    }
    private double parseFilterRating(String value) {
        if (value == null || value.isBlank()) return 0;
        try {
            double rating = Double.parseDouble(value);
            if (rating < 0 || rating > 10) throw new NumberFormatException();
            return rating;
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Minimum rating must be between 0 and 10.");
        }
    }
    private Integer parseFilterYear(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            int year = Integer.parseInt(value);
            if (year < 1888) throw new NumberFormatException();
            return year;
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid release-year range.");
        }
    }
}
