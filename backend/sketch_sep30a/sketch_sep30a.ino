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

// --- Serial link ---
// Commands (one per line, 115200 baud over USB):
//   <T0,T1,T2,T3>  green seconds for North, East, South, West (5-60)
//   ?              report the current state and timings
// Reports sent back to the web app:
//   READY,UNO_R4_MINIMA,4        after start-up
//   PHASE,<lane>,<GREEN|YELLOW>,<seconds>   whenever the lights change
//   TIMINGS,<T0>,<T1>,<T2>,<T3>   after timings are applied or on request
//   ERR,<reason>                  when a command is not understood
const int SERIAL_BUFFER = 48;
char serialBuffer[SERIAL_BUFFER];
int serialLength = 0;

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

void reportPhase() {
  Serial.print("PHASE,");
  Serial.print(activeLane);
  Serial.print(currentPhase == PHASE_GREEN ? ",GREEN," : ",YELLOW,");
  Serial.println(countdown);
}

void reportTimings() {
  Serial.print("TIMINGS");
  for (int i = 0; i < 4; i++) {
    Serial.print(',');
    Serial.print(greenDurations[i]);
  }
  Serial.println();
}

// Apply a timing packet "<T0,T1,T2,T3>" (brackets already present).
void applyTimings(String packet) {
  packet = packet.substring(1, packet.length() - 1);
  int parsed[4];
  int idx = 0;
  int startIdx = 0;

  for (int i = 0; i <= (int)packet.length(); i++) {
    if (i == (int)packet.length() || packet.charAt(i) == ',') {
      if (idx < 4) {
        parsed[idx++] = packet.substring(startIdx, i).toInt();
      } else {
        idx++;
      }
      startIdx = i + 1;
    }
  }

  if (idx == 4) {
    for (int i = 0; i < 4; i++) {
      greenDurations[i] = constrain(parsed[i], 5, 60); // Bound between 5s and 60s
    }
    Serial.println("ACK: Dynamic Timings Applied");
    reportTimings();
  } else {
    Serial.println("ERR,Expected four values like <10,10,10,10>");
  }
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;
  if (line == "?") {
    reportPhase();
    reportTimings();
  } else if (line.startsWith("<") && line.endsWith(">")) {
    applyTimings(line);
  } else {
    Serial.println("ERR,Unknown command");
  }
}

// Read serial without blocking, so the multiplexed displays never stall
// while a command is still arriving.
void readSerialTimings() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLength > 0) {
        serialBuffer[serialLength] = '\0';
        handleCommand(String(serialBuffer));
        serialLength = 0;
      }
    } else if (serialLength < SERIAL_BUFFER - 1) {
      serialBuffer[serialLength++] = c;
    } else {
      serialLength = 0; // Overlong line: drop it
      Serial.println("ERR,Line too long");
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

  Serial.println("READY,UNO_R4_MINIMA,4");
  reportTimings();
  reportPhase();
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
      reportPhase();
    }
  }

  // Display multiplexing across all 4 displays
  for (int i = 0; i < 4; i++) {
    refreshTimerDisplay(getWaitTime(i), RCLK[i]);
  }
}