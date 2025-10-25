package com.videoconf.repository;

import com.videoconf.model.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface RoomRepository extends JpaRepository<Room, String> {
    Optional<Room> findByIdAndIsActiveTrue(String id);
    boolean existsByIdAndIsActiveTrue(String id);
}