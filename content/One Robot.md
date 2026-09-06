---
description: World models for robot evals and training. YC W26.
---

**Website:** https://www.onerobot.io/ | **YC:** https://www.ycombinator.com/companies/one-robot

One Robot builds simulation environments that are realistic to see and realistic to interact with, so robotics teams can train and evaluate robot policies without being bottlenecked by robot time.

Today, improving a VLA often means more real-world hours: setting up the scene, running trials, resetting, and repeating. This loop is slow, expensive, and hard to scale. For example, material handling and manufacturing assembly tasks, models need far more training and evaluation data than teams can collect in the real world.

One Robot uses task-specific data to build world model-based simulation environments for hard manipulation tasks (for example, textiles and box folding). These environments help teams run more training and evals, find failure modes faster, and accelerate iteration on action policies with less dependence on real-world data collection and robot availability.

_Usage:_

"How does One Robot achieve realistic interaction in its simulations compared to generic physics‑based simulators?"

"One Robot trains a task‑specific world model from real‑world data for each manipulation scenario (e.g., textiles or box folding); the model directly learns visual appearance and contact dynamics, so the simulated environment reproduces the exact friction, deformation, and visual cues of the real task, whereas generic simulators rely on hand‑tuned physics parameters that often miss these nuances."
