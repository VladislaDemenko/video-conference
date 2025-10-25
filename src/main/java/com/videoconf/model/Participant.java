package com.videoconf.model;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "participants")
public class Participant {
    @Id
    private String id;

    @ManyToOne
    private Room room;

    @ManyToOne
    private User user;

    private boolean isAudioEnabled;
    private boolean isVideoEnabled;
    private boolean isConnected;
    private LocalDateTime joinedAt;
    private LocalDateTime lastSeen;

    public Participant() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Room getRoom() { return room; }
    public void setRoom(Room room) { this.room = room; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public boolean isAudioEnabled() { return isAudioEnabled; }
    public void setAudioEnabled(boolean audioEnabled) { isAudioEnabled = audioEnabled; }

    public boolean isVideoEnabled() { return isVideoEnabled; }
    public void setVideoEnabled(boolean videoEnabled) { isVideoEnabled = videoEnabled; }

    public boolean isConnected() { return isConnected; }
    public void setConnected(boolean connected) { isConnected = connected; }

    public LocalDateTime getJoinedAt() { return joinedAt; }
    public void setJoinedAt(LocalDateTime joinedAt) { this.joinedAt = joinedAt; }

    public LocalDateTime getLastSeen() { return lastSeen; }
    public void setLastSeen(LocalDateTime lastSeen) { this.lastSeen = lastSeen; }
}