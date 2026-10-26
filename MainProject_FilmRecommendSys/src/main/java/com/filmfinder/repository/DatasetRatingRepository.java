package com.filmfinder.repository;

import com.filmfinder.model.DatasetRating;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DatasetRatingRepository extends JpaRepository<DatasetRating, Long> {
    List<DatasetRating> findByTitleOrderById(String title);
    void deleteByTitle(String title);
}
