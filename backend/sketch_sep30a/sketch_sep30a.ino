// ==========================================
// 4-WAY ADAPTIVE TRAFFIC CONTROL SYSTEM
// ==========================================
// The lights run the same two phases as the web app's algorithm:
//   Phase 0 = Road 1 (North and South approaches together)
//   Phase 1 = Road 2 (East and West approaches together)
// Every change goes Green -> Yellow (3 s) -> All red (1.5 s) -> next Green.
//
// With the web app connected the board is in FOLLOW mode and copies the
// app's lights and countdowns exactly. If the app goes quiet for 3 s the
// board ends the current green safely and carries on in AUTO mode, cycling
// the same two phases with fixed green times.

// --- LED Pin Assignments (index = approach: 0=North, 1=East, 2=South, 3=West) ---
const int L_RED[4]    = {2, 5, 8, 11};
const int L_YELLOW[4] = {3, 6, 9, 12};
const int L_GREEN[4]  = {4, 7, 10, 13};

// Phase that each approach belongs to.
const int APPROACH_PHASE[4] = {0, 1, 0, 1};

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

// --- Timings (must match DEFAULT_TIMING in src/simulation/config.js) ---
const unsigned long YELLOW_MS  = 3000;
const unsigned long ALL_RED_MS = 1500;
int greenSeconds[2] = {10, 10}; // AUTO mode green per phase, 5-60 s

// --- Signal state ---
enum Stage { STAGE_GREEN, STAGE_YELLOW, STAGE_ALL_RED };
Stage stage = STAGE_GREEN;
int activePhase = 0;            // Phase that is green/yellow, or that just ended (all red)
unsigned long stageStart = 0;
unsigned long stageLength = 10000;

// --- Follow mode ---
enum ControlMode { MODE_AUTO, MODE_FOLLOW };
ControlMode controlMode = MODE_AUTO;
const unsigned long FOLLOW_TIMEOUT = 3000;
unsigned long lastFrame = 0;
int followCount[4] = {0, 0, 0, 0}; // -1 = blank display

// --- Serial link (115200 baud over USB, one command per line) ---
// Commands:
//   L,<N>,<E>,<S>,<W>,<cN>,<cE>,<cS>,<cW>
//        follow mode: light per approach (G, Y or R) and the number for each
//        display (0-99, or - for blank); repeat at least every 3 s
//   <G1,G2>   AUTO mode green seconds for Road 1 and Road 2 (5-60)
//   ?         report mode, stage and timings
// Reports:
//   READY,UNO_R4_MINIMA,2
//   MODE,<AUTO|FOLLOW>
//   PHASE,<phase>,<GREEN|YELLOW|ALLRED>,<ms left>   on every stage change
//   TIMINGS,<G1>,<G2>
//   ERR,<reason>
const int SERIAL_BUFFER = 64;
char serialBuffer[SERIAL_BUFFER];
int serialLength = 0;

// --- Helper Functions ---

void setLightState(int lane, int r, int y, int g) {
  digitalWrite(L_RED[lane],    r);
  digitalWrite(L_YELLOW[lane], y);
  digitalWrite(L_GREEN[lane],  g);
}

void setLight(int lane, char light) {
  setLightState(lane, light == 'R' ? HIGH : LOW, light == 'Y' ? HIGH : LOW, light == 'G' ? HIGH : LOW);
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

void blankDisplay(int rclkPin) {
  writeShiftRegister(rclkPin, 0xFF, 0x00); // All segments off
}

unsigned long stageRemaining() {
  unsigned long elapsed = millis() - stageStart;
  return elapsed >= stageLength ? 0 : stageLength - elapsed;
}

int roundUpSeconds(unsigned long ms) {
  return (int)((ms + 999) / 1000);
}

// Seconds until each approach's light changes. Same sums as the web app's
// countdown boards (AdaptiveController.countdown).
int autoCountdown(int approach) {
  unsigned long left = stageRemaining();
  bool own = APPROACH_PHASE[approach] == activePhase;
  unsigned long ms;
  if (stage == STAGE_GREEN) {
    ms = own ? left : left + YELLOW_MS + ALL_RED_MS;
  } else if (stage == STAGE_YELLOW) {
    ms = own ? left : left + ALL_RED_MS;
  } else {
    // All red: the other phase is next; this one waits for it to run.
    ms = own ? left + greenSeconds[1 - activePhase] * 1000UL + YELLOW_MS + ALL_RED_MS : left;
  }
  return roundUpSeconds(ms);
}

void applyAutoLights() {
  for (int i = 0; i < 4; i++) {
    bool own = APPROACH_PHASE[i] == activePhase;
    if (own && stage == STAGE_GREEN) setLight(i, 'G');
    else if (own && stage == STAGE_YELLOW) setLight(i, 'Y');
    else setLight(i, 'R');
  }
}

void reportPhase() {
  Serial.print("PHASE,");
  Serial.print(activePhase);
  Serial.print(stage == STAGE_GREEN ? ",GREEN," : stage == STAGE_YELLOW ? ",YELLOW," : ",ALLRED,");
  Serial.println(stageRemaining());
}

void reportTimings() {
  Serial.print("TIMINGS,");
  Serial.print(greenSeconds[0]);
  Serial.print(',');
  Serial.println(greenSeconds[1]);
}

void reportMode() {
  Serial.println(controlMode == MODE_FOLLOW ? "MODE,FOLLOW" : "MODE,AUTO");
}

void startStage(Stage next, int phase) {
  stage = next;
  activePhase = phase;
  stageStart = millis();
  if (next == STAGE_GREEN) stageLength = greenSeconds[phase] * 1000UL;
  else if (next == STAGE_YELLOW) stageLength = YELLOW_MS;
  else stageLength = ALL_RED_MS;
  applyAutoLights();
  reportPhase();
}

// AUTO mode: Green -> Yellow -> All red -> other phase Green.
void advanceAuto() {
  if (stageRemaining() > 0) return;
  if (stage == STAGE_GREEN) startStage(STAGE_YELLOW, activePhase);
  else if (stage == STAGE_YELLOW) startStage(STAGE_ALL_RED, activePhase);
  else startStage(STAGE_GREEN, 1 - activePhase);
}

// App went quiet: never jump straight to another green. A green still
// showing ends with a full yellow, then the normal cycle continues.
void resumeAutoCycle() {
  controlMode = MODE_AUTO;
  reportMode();
  if (stage == STAGE_ALL_RED) startStage(STAGE_ALL_RED, activePhase);
  else startStage(STAGE_YELLOW, activePhase);
}

// Apply a timing packet "<G1,G2>".
void applyTimings(String packet) {
  packet = packet.substring(1, packet.length() - 1);
  int comma = packet.indexOf(',');
  if (comma < 0 || packet.indexOf(',', comma + 1) >= 0) {
    Serial.println("ERR,Expected two values like <10,10>");
    return;
  }
  greenSeconds[0] = constrain((int)packet.substring(0, comma).toInt(), 5, 60);
  greenSeconds[1] = constrain((int)packet.substring(comma + 1).toInt(), 5, 60);
  Serial.println("ACK: Dynamic Timings Applied");
  reportTimings();
}

// Apply a follow frame "L,G,R,G,R,12,15,12,15".
void applyFrame(String line) {
  String fields[8];
  int count = 0;
  int startIdx = 2; // after "L,"
  for (int i = 2; i <= (int)line.length(); i++) {
    if (i == (int)line.length() || line.charAt(i) == ',') {
      if (count < 8) fields[count] = line.substring(startIdx, i);
      count++;
      startIdx = i + 1;
    }
  }
  if (count != 8) {
    Serial.println("ERR,Expected L,<4 lights>,<4 numbers>");
    return;
  }

  char lights[4];
  bool moving[2] = {false, false}; // phase has a green or yellow
  bool anyGreen = false;
  for (int i = 0; i < 4; i++) {
    if (fields[i] != "G" && fields[i] != "Y" && fields[i] != "R") {
      Serial.println("ERR,Lights must be G, Y or R");
      return;
    }
    lights[i] = fields[i].charAt(0);
    if (lights[i] != 'R') moving[APPROACH_PHASE[i]] = true;
    if (lights[i] == 'G') anyGreen = true;
  }
  // Safety: never show green or yellow on both roads at once.
  if (moving[0] && moving[1]) {
    Serial.println("ERR,Conflicting greens rejected");
    return;
  }

  for (int i = 0; i < 4; i++) {
    setLight(i, lights[i]);
    followCount[i] = fields[i + 4] == "-" ? -1 : constrain((int)fields[i + 4].toInt(), 0, 99);
  }

  // Track the stage being shown so a fallback starts from the right place.
  if (moving[0] || moving[1]) {
    activePhase = moving[0] ? 0 : 1;
    stage = anyGreen ? STAGE_GREEN : STAGE_YELLOW;
  } else {
    stage = STAGE_ALL_RED;
  }

  lastFrame = millis();
  if (controlMode != MODE_FOLLOW) {
    controlMode = MODE_FOLLOW;
    reportMode();
  }
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;
  if (line == "?") {
    reportMode();
    reportPhase();
    reportTimings();
  } else if (line.startsWith("L,")) {
    applyFrame(line);
  } else if (line.startsWith("<") && line.endsWith(">")) {
    applyTimings(line);
  } else {
    Serial.println("ERR,Unknown command");
  }
}

// Read serial without blocking, so the multiplexed displays never stall
// while a command is still arriving.
void readSerial() {
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

  Serial.println("READY,UNO_R4_MINIMA,2");
  reportMode();
  reportTimings();
  // Start from all red so no green appears without warning after a reset.
  startStage(STAGE_ALL_RED, 1);
}

void loop() {
  readSerial();

  if (controlMode == MODE_FOLLOW && millis() - lastFrame > FOLLOW_TIMEOUT) {
    resumeAutoCycle();
  }

  if (controlMode == MODE_AUTO) {
    advanceAuto();
  }

  // Display multiplexing across all 4 displays
  for (int i = 0; i < 4; i++) {
    int value = controlMode == MODE_FOLLOW ? followCount[i] : autoCountdown(i);
    if (value < 0) blankDisplay(RCLK[i]);
    else refreshTimerDisplay(value, RCLK[i]);
  }
}
