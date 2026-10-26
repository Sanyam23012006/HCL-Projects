package com.filmfinder.repository;

import com.filmfinder.model.AppMovie;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AppMovieRepository extends JpaRepository<AppMovie, String> {
    Optional<AppMovie> findByTitleIgnoreCase(String title);
}
