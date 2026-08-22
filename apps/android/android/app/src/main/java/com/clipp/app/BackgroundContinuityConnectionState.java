package com.clipp.app;

enum BackgroundContinuityConnectionState {
    CONNECTED("connected"),
    WAITING("waiting"),
    RECONNECTING("reconnecting"),
    PAUSED("paused"),
    DISCONNECTED("disconnected");

    final String wireValue;

    BackgroundContinuityConnectionState(String wireValue) {
        this.wireValue = wireValue;
    }

    static BackgroundContinuityConnectionState fromWire(String wireValue) {
        for (BackgroundContinuityConnectionState state : values()) {
            if (state.wireValue.equals(wireValue)) return state;
        }
        return WAITING;
    }
}
