---
description: File transfer protocol delivering 10x faster speeds than TCP, 1000x improvement on unreliable networks. YC W26.
---

Built a new file transfer protocol that claims 10x faster speeds than TCP under normal conditions and 1000x improvement on unreliable, high-latency networks. TCP's congestion control algorithm was designed in 1988 for a world of wired connections; it performs poorly on satellite, mobile, and international links.

The benchmark claims are large enough to be skeptical of until independently verified — but the problem space is real. QUIC (used in HTTP/3) already demonstrated that TCP's assumptions are limiting. Byteport is betting that file transfer specifically has worse assumptions and more room to improve than general web traffic.

Practical applications: large model downloads, training data transfers, cross-region backup, multi-site content delivery. All of these are bottlenecked by the same TCP assumptions that Byteport targets.

Sits alongside [RunAnywhere](./RunAnywhere.md) and [S2](./S2.md) in the AI infrastructure layer — all three making the physical movement of data faster and more reliable as AI workloads demand more of the network.

_Usage:_

"Why build a custom protocol instead of using QUIC?"

"While QUIC demonstrated that TCP's 1988 congestion control limits general web traffic, Byteport targets bulk file transfers specifically—such as large model downloads, training data, and cross-region backups. It bets that dedicated file transfer has worse protocol bottlenecks and more room for optimization than general web traffic, aiming for 10x speedups on standard networks and up to 1000x on high-latency, unreliable links."
