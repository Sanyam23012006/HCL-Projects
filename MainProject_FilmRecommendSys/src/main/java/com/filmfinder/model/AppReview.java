package com.filmfinder.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "app_reviews", uniqueConstraints = @UniqueConstraint(columnNames = {"movie_id", "user_id"}))
public class AppReview {
    @Id
    public String id;
    @Column(name = "movie_id", nullable = false, length = 36)
    public String movieId;
    @Column(name = "user_id", nullable = false, length = 36)
    public String userId;
    @Column(nullable = false, length = 60)
    public String userName;
    @Column(nullable = false)
    public int rating;
    @Column(nullable = false, length = 1000)
    public String text;
    @Column(nullable = false)
    public String createdAt;
    @Column(nullable = false)
    public String updatedAt;
}
