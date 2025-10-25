package com.videoconf.repository;

import com.videoconf.model.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface RoomRepository extends JpaRepository<Room, String> {
    Optional<Room> findByIdAndIsActiveTrue(String id);
    Optional<Room> findByInviteCodeAndIsActiveTrue(String inviteCode);
    boolean existsByIdAndIsActiveTrue(String id);
    boolean existsByInviteCodeAndIsActiveTrue(String inviteCode);
}