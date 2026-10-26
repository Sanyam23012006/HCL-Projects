package com.filmfinder.repository;

import com.filmfinder.model.AppReview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppReviewRepository extends JpaRepository<AppReview, String> {
    List<AppReview> findByMovieIdOrderByCreatedAtDesc(String movieId);
    Optional<AppReview> findByMovieIdAndUserId(String movieId, String userId);
}
