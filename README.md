# Control System Interactive Simulators

This repository contains a collection of interactive educational simulators for control systems engineering. These web-based tools provide real-time visualization of system dynamics. They are designed to help students and professionals build an intuitive understanding of control theory concepts.

![Control System Simulators](images/control-system-simulators.png)

## Available Simulators

### First-Order System
This simulator visualizes the step response of a standard first-order system. Users can adjust the steady-state gain and the time constant. The plot automatically annotates the time constant and settling time to demonstrate how these parameters shape the transient response.

![First-Order System](images/first-order-system.png)

### Second-Order System
This tool explores the step response of a second-order system. By tuning the natural frequency and the damping ratio, users can observe the transition between underdamped, critically damped, and overdamped regimes. Important characteristics like rise time, peak time, overshoot, and settling time are annotated directly on the graph.

![Second-Order System](images/second-order-system.png)

### Pole-Zero Map
The Pole-Zero Map simulator provides a direct link between the s-plane and time-domain behavior. Users can adjust the system gain, place a pole pair, and include an optional zero to immediately see the resulting step and impulse responses. The interactive interface makes it easy to understand stable, oscillatory, slow, and unstable configurations.

![Pole-Zero Map](images/pole-zero.png)

### PID Controller
This simulator focuses on closed-loop controller design. Users can configure a plant model and a reference signal, then tune the proportional, integral, and derivative gains. The real-time animated response clearly reveals the effect of each control action on tracking capability and system stability.

![PID Controller](images/pid.png)

## Live Demo

The simulators are published and available online at:

**https://smkalami.github.io/control-system-interactive-simulators/**

## Usage

### Online

Visit the live site linked above to use the simulators directly in your browser. No installation or setup is required.

### Local

To run the simulators locally, clone this repository and open the corresponding `index.html` file in a modern web browser. No specialized servers or build tools are required.

### Embedding in a Website or LMS (e.g., Blackboard)

You can embed any simulator directly into a webpage or Learning Management System using an `<iframe>`. Below are sample embed codes for each simulator.

**Simulator Hub (all simulators):**
```html
<iframe
  src="https://smkalami.github.io/control-system-interactive-simulators/"
  width="100%"
  height="700"
  style="border: none;"
  allowfullscreen
  title="Control System Interactive Simulators">
</iframe>
```

**First-Order System:**
```html
<iframe
  src="https://smkalami.github.io/control-system-interactive-simulators/linear-system-1st-order/"
  width="100%"
  height="700"
  style="border: none;"
  allowfullscreen
  title="First-Order System Simulator">
</iframe>
```

**Second-Order System:**
```html
<iframe
  src="https://smkalami.github.io/control-system-interactive-simulators/linear-system-2nd-order/"
  width="100%"
  height="700"
  style="border: none;"
  allowfullscreen
  title="Second-Order System Simulator">
</iframe>
```

**Pole-Zero Map:**
```html
<iframe
  src="https://smkalami.github.io/control-system-interactive-simulators/pole-zero/"
  width="100%"
  height="700"
  style="border: none;"
  allowfullscreen
  title="Pole-Zero Map Simulator">
</iframe>
```

**PID Controller:**
```html
<iframe
  src="https://smkalami.github.io/control-system-interactive-simulators/pid/"
  width="100%"
  height="700"
  style="border: none;"
  allowfullscreen
  title="PID Controller Simulator">
</iframe>
```

Paste the desired snippet into an HTML block or "Embed" widget in your LMS. Adjust the `width` and `height` attributes to fit your page layout.

## Author

Created by Mostapha Kalami Heris.
