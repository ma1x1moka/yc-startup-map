---
description: Egocentric and robot training datasets from real workplaces for embodied AI. YC F25.
aliases: Cortex
---

Founded by [Lucas Ngoo](./Lucas%20Ngoo.md). Raised $6M. Builds high-quality training datasets for embodied AI — specifically egocentric video (first-person perspective) and robot data captured in real workplace environments, with hand and body pose annotations.

The training data bottleneck for robotics is acute: robots need to learn from demonstrations, but demonstration data is expensive, hard to collect, and usually captured in sterile lab environments. Cortex AI captures data in real factories, warehouses, and workplaces — messier but more representative of actual deployment conditions.

The annotation layer (hand pose, body pose, object interaction) is what separates Cortex AI from raw video: annotated data is what robots can actually learn from.

Sits in the same data infrastructure layer as [Ndea](./Ndea.md)'s training data philosophy — both companies believe the quality and type of training data matters as much as the architecture of the model being trained.

_Usage:_

"Isn't synthetic data replacing real demonstrations for robot training?"

"Not yet at the manipulation skill level. Synthetic data works for navigation; for fine manipulation tasks — screwing a bolt, folding fabric — real demonstration data still produces better policies."
