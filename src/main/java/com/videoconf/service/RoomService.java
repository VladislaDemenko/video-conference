package com.videoconf.service;

import com.videoconf.model.Room;
import com.videoconf.repository.RoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
public class RoomService {

    @Autowired
    private RoomRepository roomRepository;

    public Room createRoom(String roomName, String ownerId, int maxParticipants) {
        Room room = new Room();
        room.setId(generateRoomId());
        room.setName(roomName);
        room.setOwnerId(ownerId);
        room.setCreatedAt(LocalDateTime.now());
        room.setActive(true);
        room.setMaxParticipants(maxParticipants);
        room.setInviteCode(generateInviteCode());

        return roomRepository.save(room);
    }

    public Optional<Room> getRoom(String roomId) {
        return roomRepository.findByIdAndIsActiveTrue(roomId);
    }

    public Optional<Room> getRoomByInviteCode(String inviteCode) {
        return roomRepository.findByInviteCodeAndIsActiveTrue(inviteCode);
    }

    public boolean roomExists(String roomId) {
        return roomRepository.existsByIdAndIsActiveTrue(roomId);
    }

    public boolean inviteCodeExists(String inviteCode) {
        return roomRepository.existsByInviteCodeAndIsActiveTrue(inviteCode);
    }

    private String generateRoomId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private String generateInviteCode() {
        return String.format("%06d", (int) (Math.random() * 1000000));
    }
}