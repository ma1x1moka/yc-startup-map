---
description: Egocentric and robot training datasets from real workplaces for embodied AI. YC F25.
aliases: Cortex
---

Founded by [Lucas Ngoo](./Lucas%20Ngoo.md). Raised $6M. Builds high-quality training datasets for embodied AI — specifically egocentric video (first-person perspective) and robot data captured in real workplace environments, with hand and body pose annotations.

The training data bottleneck for robotics is acute: robots need to learn from demonstrations, but demonstration data is expensive, hard to collect, and usually captured in sterile lab environments. Cortex AI captures data in real factories, warehouses, and workplaces — messier but more representative of actual deployment conditions.

The annotation layer (hand pose, body pose, object interaction) is what separates Cortex AI from raw video: annotated data is what robots can actually learn from.

Sits in the same data infrastructure layer as [Ndea](./Ndea.md)'s training data philosophy — both companies believe the quality and type of training data matters as much as the architecture of the model being trained.

_Usage:_

"Why not just use raw video or standard lab demonstrations for robot training?"

"Standard lab demonstrations are expensive, hard to collect, and too sterile compared to actual deployment environments, while raw video lacks the structure models need to learn. Cortex AI collects egocentric video directly in real factories and warehouses, then adds an annotation layer for hand pose, body pose, and object interactions so embodied AI can actually learn from realistic, messy real-world data."
