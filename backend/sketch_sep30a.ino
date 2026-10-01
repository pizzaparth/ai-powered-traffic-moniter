// ==========================================
// 4-WAY ADAPTIVE TRAFFIC CONTROL SYSTEM
// ==========================================

// --- LED Pin Assignments ---
const int L_RED[4]    = {2, 5, 8, 11};
const int L_YELLOW[4] = {3, 6, 9, 12};
const int L_GREEN[4]  = {4, 7, 10, 13};

// --- 74HC595 Display Pins ---
const int SCLK_PIN = A0;  // Shared Clock
const int DIO_PIN  = A1;  // Shared Data
const int RCLK[4]  = {A2, A3, A4, A5}; // Independent Latches

// Common Anode 7-segment digit bitmasks (0-9)
const byte digitCA[] = {
  0xC0, 0xF9, 0xA4, 0xB0, 0x99, 
  0x92, 0x82, 0xF8, 0x80, 0x90
};

// Multiplexing digit position select (Position 1 = Ones, Position 2 = Tens)
const byte POS_ONES = 0x01;
const byte POS_TENS = 0x02;

// --- Timings & States ---
const int YELLOW_TIME = 3;
int greenDurations[4] = {10, 10, 10, 10}; // Default durations

enum PhaseType { PHASE_GREEN, PHASE_YELLOW };
int activeLane = 0;              // 0=North, 1=East, 2=South, 3=West
PhaseType currentPhase = PHASE_GREEN;

int countdown = 10;
unsigned long lastTick = 0;

// --- Helper Functions ---

void setLightState(int lane, int r, int y, int g) {
  digitalWrite(L_RED[lane],    r);
  digitalWrite(L_YELLOW[lane], y);
  digitalWrite(L_GREEN[lane],  g);
}

void updateTrafficSignals() {
  for (int i = 0; i < 4; i++) {
    if (i == activeLane) {
      if (currentPhase == PHASE_GREEN) {
        setLightState(i, LOW, LOW, HIGH);  // Active Green
      } else {
        setLightState(i, LOW, HIGH, LOW);  // Active Yellow
      }
    } else {
      setLightState(i, HIGH, LOW, LOW);    // All other lanes RED
    }
  }
}

void writeShiftRegister(int rclkPin, byte segments, byte digitPos) {
  digitalWrite(rclkPin, LOW);
  shiftOut(DIO_PIN, SCLK_PIN, MSBFIRST, segments);
  shiftOut(DIO_PIN, SCLK_PIN, MSBFIRST, digitPos);
  digitalWrite(rclkPin, HIGH);
}

void refreshTimerDisplay(int number, int rclkPin) {
  int val = constrain(number, 0, 99);
  int tens = val / 10;
  int ones = val % 10;

  // Tens digit
  writeShiftRegister(rclkPin, digitCA[tens], POS_TENS);
  delayMicroseconds(400);
  writeShiftRegister(rclkPin, 0xFF, 0x00);

  // Ones digit
  writeShiftRegister(rclkPin, digitCA[ones], POS_ONES);
  delayMicroseconds(400);
  writeShiftRegister(rclkPin, 0xFF, 0x00);
}

// Calculate remaining wait time for non-active lanes
int getWaitTime(int laneIndex) {
  if (laneIndex == activeLane) return countdown;

  int wait = countdown;
  if (currentPhase == PHASE_GREEN) wait += YELLOW_TIME;

  int lane = (activeLane + 1) % 4;
  while (lane != laneIndex) {
    wait += greenDurations[lane] + YELLOW_TIME;
    lane = (lane + 1) % 4;
  }
  return wait;
}

// Check Serial for incoming timing string: "<T0,T1,T2,T3>"
void readSerialTimings() {
  if (Serial.available()) {
    String packet = Serial.readStringUntil('\n');
    packet.trim();
    if (packet.startsWith("<") && packet.endsWith(">")) {
      packet = packet.substring(1, packet.length() - 1);
      int parsed[4];
      int idx = 0;
      int startIdx = 0;

      for (int i = 0; i <= packet.length(); i++) {
        if (i == packet.length() || packet.charAt(i) == ',') {
          if (idx < 4) {
            parsed[idx++] = packet.substring(startIdx, i).toInt();
            startIdx = i + 1;
          }
        }
      }

      if (idx == 4) {
        for (int i = 0; i < 4; i++) {
          greenDurations[i] = constrain(parsed[i], 5, 60); // Bound between 5s and 60s
        }
        Serial.println("ACK: Dynamic Timings Applied");
      }
    }
  }
}

// --- Setup & Execution ---

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < 4; i++) {
    pinMode(L_RED[i], OUTPUT);
    pinMode(L_YELLOW[i], OUTPUT);
    pinMode(L_GREEN[i], OUTPUT);
    pinMode(RCLK[i], OUTPUT);
  }

  pinMode(SCLK_PIN, OUTPUT);
  pinMode(DIO_PIN, OUTPUT);

  countdown = greenDurations[activeLane];
  updateTrafficSignals();
}

void loop() {
  readSerialTimings();

  // 1-second countdown clock
  if (millis() - lastTick >= 1000) {
    lastTick = millis();
    countdown--;

    if (countdown < 0) {
      if (currentPhase == PHASE_GREEN) {
        currentPhase = PHASE_YELLOW;
        countdown = YELLOW_TIME;
      } else {
        currentPhase = PHASE_GREEN;
        activeLane = (activeLane + 1) % 4;
        countdown = greenDurations[activeLane];
      }
      updateTrafficSignals();
    }
  }

  // Display multiplexing across all 4 displays
  for (int i = 0; i < 4; i++) {
    refreshTimerDisplay(getWaitTime(i), RCLK[i]);
  }
}