# An AI powered smart traffic monitering and management system.

- the name says AI but initially, we use algorithm to switch lights.

- the home page starts with the 3d model of traffic light then it animates as we scroll the page, like in websites like apple. 

- i have installed stuff like npm install three @react-three/fiber @react-three/drei gsap

use these to implement the things which i am about to say, also download and setup framer motion.

- no use of gradient in background, in cards, in text and in buttonns

- do use the tinted pills, use pills with solid color with a contrasting color text.

- In future hardware will also be integrated in the project. 

## Simulation

- This page should use solid white theme with black text, again no grey text. Dont write unnecessary long pargraphs. Use max 2 lines of describe something. Use large and bold font size.

- This page should have a a simulation of a road intersection, with 2 lanes on each roads and cars randomly spawning in any lane. 

- Build the entire scene using the assets in the public folder, there is one for all different types of cars. Dont simulate things like accelration, tire rotation, just plain simple constant velocity with breaking. 

- for the road and intersection using main_road_builder and use traffic lights from main_traffic_light. 

- make different different types of cars spawn at different times and different time intervels.

for the traffic lights, remove the pedestiral sign, dont use it. Also add a sign board next to the 3 traffic lights for each lane, which has a countdown which glows red for counting down red light and glows green for counting down time remaining in green light. 

- the traffic should flow in both the lanes for each road. 
- programm smooth turn animations for cars when turing in lanes.

- dont make cars switch lanes. 
- program such that no cars collide.

- Add buttons on top for each road labeled as lane1 road 1, lane 2 road 2, and so on. When clicked on a button, spawn a car into that lane. Ensure that there is a cap on number of cars in each lane. 

- the simluations should be in a 3d box and we can move around using gestures on touchpad or mouse. 

## tabs - simulation, activity (which has all the logs of every action performed by the algorithm and the user), hardware configuration, all of these tabs should be in the pill navbar which should stay afloat regarless of scroll.


- construct a road model with intersction, lane markings, traffic lights, ensure that traffic light blink. The interscetion should be in a "+" sign with in both of the lanes the cars move in same direction.. 

- dont code the backend, dont code the hardware, just code the frontend. 

- dont commit or push.


# Use this algo for traffic light switching -  Adaptive Smart Traffic Signal Algorithm

## Objective

Design a traffic-signal controller that:

- Minimizes average vehicle waiting time.
- Minimizes unnecessary stopping.
- Maximizes intersection throughput.
- Prevents any lane from being starved indefinitely.
- Automatically adapts green-light duration to current traffic.

---

## 1. Inputs

For every incoming lane `i`, continuously measure:

- `Q[i]` = number of vehicles currently waiting.
- `A[i]` = estimated vehicle arrival rate.
- `W[i]` = waiting time of the oldest vehicle.
- `D[i]` = available capacity in the downstream road.
- `F[i]` = estimated discharge/service rate of the lane.

Optional inputs:

- Emergency vehicle presence.
- Pedestrian crossing requests.
- Public transport priority.
- Turning traffic: left, right, straight.
- Historical traffic patterns.

---

## 2. Define Signal Phases

Do not control every lane independently.

Group movements that can safely receive green simultaneously into **phases**.

Example:

```text
Phase 1:
North → South
South → North

Phase 2:
East → West
West → East

Phase 3:
North/South right or left turns

Phase 4:
East/West right or left turns
```

Only one set of conflicting phases can be active at a time.

---

# 3. Calculate Effective Queue Pressure

For every lane:

\[
Pressure_i = Q_i - \lambda D_i
\]

where:

- `Q_i` = vehicles waiting upstream.
- `D_i` = congestion in the road receiving those vehicles.
- `λ` = downstream-congestion penalty.

The idea is simple:

> A lane should not receive a long green if the road ahead is already full.

For every phase:

\[
PhasePressure_p = \sum_{i \in p} Pressure_i
\]

Higher pressure means that clearing that phase produces a larger reduction in congestion.

---

# 4. Add Waiting-Time Priority

Queue size alone can cause low-traffic lanes to wait indefinitely.

Therefore calculate:

\[
WaitingPriority_i =
\alpha Q_i +
\beta W_i
\]

where:

- `α` controls the importance of queue size.
- `β` controls the importance of waiting time.

Then calculate the phase demand:

\[
Demand_p =
\sum_{i \in p}
(
\alpha Q_i +
\beta W_i
+
\gamma A_i
)
\]

where `γ` gives some importance to vehicles expected to arrive shortly.

This allows the system to react not only to the current queue but also to incoming traffic.

---

# 5. Calculate Phase Score

Combine traffic pressure, waiting time and arrival rate:

\[
Score_p =
a(PhasePressure_p)
+
b(Demand_p)
+
c(Starvation_p)
\]

where:

- `a` = congestion-clearing weight.
- `b` = demand weight.
- `c` = fairness/starvation weight.

`Starvation_p` increases the longer a phase has not received green.

For example:

\[
Starvation_p =
\frac{TimeSinceLastGreen_p}
{MaxAllowedWaitingTime}
\]

---

# 6. Select the Next Green Phase

Choose:

\[
NextPhase = \arg\max_p Score_p
\]

In other words:

> Give green to the phase that currently provides the highest congestion-reduction benefit.

However, do not immediately switch every time another phase becomes slightly better.

Use a switching threshold:

\[
Score_{new}
>
Score_{current}
+
SwitchThreshold
\]

This prevents the traffic light from constantly switching between phases.

---

# 7. Minimum Green Time

Whenever a phase becomes green, it must remain green for at least:

\[
G_{min}
\]

Example:

```text
G_min = 8–12 seconds
```

This prevents inefficient very-short green cycles.

During `G_min`, the controller does not switch phases unless there is an emergency.

---

# 8. Dynamically Extend Green Time

After the minimum green period, continuously check whether vehicles are still passing efficiently.

Calculate:

\[
Utilization =
\frac{VehiclesPassing}
{ExpectedMaximumVehiclesPassing}
\]

If:

```text
Utilization is high
AND
current phase still has significant queue
AND
opposing traffic pressure is not significantly larger
```

then:

```text
Extend green by Δt
```

For example:

```text
Δt = 2–5 seconds
```

Repeat this decision periodically.

---

# 9. Gap-Out Condition

Do not keep the light green simply because its calculated green duration has not expired.

Measure the gap between vehicles.

If:

```text
No vehicle crosses for GapThreshold seconds
```

for example:

```text
GapThreshold = 2–3 seconds
```

then terminate the current green.

This avoids situations such as:

```text
North-South: GREEN
No vehicles present

East-West:
25 vehicles waiting
```

The controller immediately transfers capacity to the busier direction.

---

# 10. Maximum Green Time

Every phase has:

\[
G_{max}
\]

For example:

```text
G_max = 40–90 seconds
```

Even if one road has extremely high traffic, the controller must eventually switch.

Therefore:

```text
if CurrentGreenTime >= G_max:
    terminate current phase
```

This prevents starvation of low-volume roads.

---

# 11. Starvation Protection

Define:

\[
W_{max}
\]

as the maximum acceptable waiting time.

For example:

```text
W_max = 120 seconds
```

If:

\[
W_i \ge W_{max}
\]

then heavily increase that lane's priority.

Conceptually:

```text
Normal priority:
Queue + waiting + arrival

Starvation priority:
Queue + waiting + arrival + very large bonus
```

This guarantees that every road eventually receives green.

---

# 12. Yellow and All-Red Safety Interval

Whenever switching:

```text
Current Green
↓
Yellow
↓
All Red
↓
Next Green
```

For example:

```text
Yellow   = 3 seconds
All Red  = 1–2 seconds
```

These values depend on road geometry, vehicle speed and transportation regulations.

They should not be dynamically shortened merely to improve throughput.

---

# 13. Avoid Switching When It Is Not Worth It

Every signal change introduces lost time because of:

```text
Green
→ Yellow
→ All Red
→ Green
```

Therefore switching itself has a cost.

Define:

\[
SwitchCost = LostTime \times EstimatedTrafficFlow
\]

Switch only when:

\[
BenefitOfSwitching > SwitchCost
\]

This substantially improves efficiency.

Without this rule the controller might switch too frequently.

---

# 14. Green-Time Calculation

Instead of assigning fixed green durations, estimate the amount of time required to clear most of the current queue.

If:

- `Q_p` = vehicles waiting in the phase.
- `F_p` = vehicles that can cross per second.

then:

\[
RequiredGreen_p =
StartupLoss +
\frac{Q_p}{F_p}
\]

Clamp it:

\[
Green_p =
\min
(
G_{max},
\max(
G_{min},
RequiredGreen_p
)
)
\]

Example:

```text
Queue = 20 vehicles
Discharge rate = 0.5 vehicles/sec
Startup loss = 3 sec

Required Green
= 3 + 20 / 0.5
= 43 seconds
```

So approximately:

```text
Green = 43 seconds
```

assuming it lies between the minimum and maximum limits.

---

# 15. Arrival Prediction

Vehicles approaching the signal should also influence the decision.

Define:

\[
PredictedQueue_i =
Q_i +
A_i \times H
\]

where:

- `A_i` = estimated vehicles arriving per second.
- `H` = short prediction horizon.

For example:

```text
H = 10 seconds
```

Then use:

\[
PredictedQueue_i
\]

instead of only the current queue.

This prevents unnecessary stopping.

For example, if eight vehicles are approaching a green signal and will reach it in three seconds, the controller may extend the green rather than stopping them.

---

# 16. Platoon Preservation

A major cause of unnecessary stoppage is interrupting groups of vehicles.

If sensors detect a closely spaced group of approaching vehicles—a **platoon**—estimate:

```text
TimeToArrival
PlatoonSize
```

If:

```text
TimeToArrival < small threshold
AND
opposing traffic is not critically congested
```

extend the current green long enough for the platoon to cross.

This reduces:

- braking,
- acceleration,
- fuel consumption,
- average travel time,
- queue formation.

---

# 17. Emergency Priority

If an emergency vehicle is detected:

```text
Emergency detected
        ↓
Check safe transition
        ↓
Terminate incompatible phase
        ↓
Yellow
        ↓
All Red
        ↓
Emergency direction GREEN
        ↓
Emergency vehicle passes
        ↓
Return to adaptive algorithm
```

Safety intervals must still be respected.

---

# 18. Complete Decision Algorithm

```text
START

↓
Read traffic sensors

↓
For every lane:
    Measure queue length
    Measure waiting time
    Estimate arrival rate
    Measure downstream congestion

↓
Predict near-future queue

↓
Calculate lane pressure

↓
Calculate phase pressure

↓
Calculate:
    congestion score
    waiting score
    arrival score
    starvation score

↓
Calculate total score for every valid phase

↓
Is current phase below minimum green time?

YES
    Keep current phase green

NO
    ↓

Is current lane empty / large traffic gap detected?

YES
    Consider next highest-scoring phase

NO
    ↓

Is approaching vehicle platoon worth serving?

YES
    Extend current green

NO
    ↓

Has maximum green time been reached?

YES
    Switch phase

NO
    ↓

Does another phase have significantly higher benefit?

YES
    Calculate switching cost

    If benefit > switching cost:
        Switch phase

NO
    Keep current green

↓
When switching:
    Green → Yellow → All Red → New Green

↓
Repeat continuously
```

---

# Recommended Objective Function

The controller should conceptually minimize:

\[
Cost =
w_1(\text{Total Waiting Time})
+
w_2(\text{Queue Length})
+
w_3(\text{Number of Stops})
+
w_4(\text{Downstream Congestion})
+
w_5(\text{Signal Switching Loss})
\]

while maximizing:

\[
Throughput =
\text{Vehicles successfully crossing intersection per unit time}
\]

Therefore the optimization target is:

\[
\boxed{
\text{Minimize Delay + Stops + Congestion}
\quad
\text{while maximizing Throughput}
}
\]

---

# Recommended Practical Strategy

For an actual smart-traffic prototype, the strongest simple approach is:

```text
Max-Pressure Phase Selection
        +
Dynamic Green Extension
        +
Vehicle Gap Detection
        +
Arrival Prediction
        +
Minimum/Maximum Green Limits
        +
Starvation Protection
```

The most important principle is:

> **Do not allocate green time purely according to the percentage of cars on each road.**

For example, using:

\[
Green_i =
\frac{Cars_i}{TotalCars}
\times CycleTime
\]

looks reasonable but is inefficient because it ignores downstream congestion, approaching vehicles, phase-switching losses, empty lanes, vehicle platoons and starvation.

A **max-pressure + adaptive green extension** controller responds to actual traffic conditions and is much closer to how an efficient smart-intersection algorithm should behave.
