# Top 3 Papers: Multi-Agent Memory for LLM Systems

Research conducted: 2026-03-23 via Google Scholar & arXiv

---

## 1. A Survey on the Memory Mechanism of Large Language Model based Agents

- **Authors:** Zeyu Zhang, Xiaohe Bo, Chen Ma, Rui Li, Xu Chen, Quanyu Dai, Jieming Zhu, Zhenhua Dong, Ji-Rong Wen
- **Date:** April 2024
- **arXiv:** [2404.13501](https://arxiv.org/abs/2404.13501)
- **Why it's essential:** The definitive survey on LLM agent memory. Systematically categorizes memory into short-term (working memory) and long-term (semantic, procedural, episodic). Covers design, evaluation, and applications. Heavily cited across the field — virtually every subsequent memory paper references it. Provides the taxonomic foundation for understanding all other work in this space.

### Key Contributions
- Comprehensive taxonomy of memory mechanisms (storage, retrieval, organization)
- Analysis of memory's role across agent applications (personal assistants, social simulation, tool use)
- Comparison framework for evaluating memory designs
- Identifies open challenges: memory consistency, scalability, and cross-agent sharing

---

## 2. A-MEM: Agentic Memory for LLM Agents

- **Authors:** Wujiang Xu, Zujie Liang, Kai Mei, Hang Gao, Juntao Tan, Yongfeng Zhang
- **Date:** February 2025
- **arXiv:** [2502.12110](https://arxiv.org/abs/2502.12110)
- **Citations:** 154+ on Semantic Scholar
- **Code:** https://github.com/WujiangXu/AgenticMemory
- **Why it's essential:** Introduces a dynamic, self-organizing memory system inspired by the Zettelkasten method. Unlike static memory stores, A-MEM creates interconnected knowledge networks through dynamic indexing and linking. Memories evolve as new information arrives — existing memories update their contextual representations when related new memories are integrated.

### Key Contributions
- Zettelkasten-inspired atomic note system with flexible cross-linking
- Dynamic memory evolution: new memories trigger updates to historical memory representations
- Memories can belong to multiple "boxes" simultaneously (multi-category organization)
- Superior results on LoCoMo benchmark (Single Hop, Multi Hop, Temporal, Open Domain, Adversarial QA) across 6 foundation models vs. SOTA baselines

---

## 3. Multi-Agent Memory from a Computer Architecture Perspective: Visions and Challenges Ahead

- **Authors:** Zhongming Yu, Naicheng Yu, Hejia Zhang, Wentao Ni, Mingrui Yin, Jiaying Yang, Yujie Zhao, Jishen Zhao
- **Date:** March 2026
- **arXiv:** [2603.10062](https://arxiv.org/abs/2603.10062)
- **Why it's essential:** A position paper that reframes multi-agent memory as a computer architecture problem — drawing direct parallels to CPU memory hierarchies, cache coherence protocols, and consistency models. This is the most forward-looking paper in the space, identifying the fundamental systems challenges that will determine whether multi-agent LLM systems can scale.

### Key Contributions
- Distinguishes **shared memory** (all agents access a common pool, e.g., shared vector store) vs. **distributed memory** (each agent owns local memory, synchronizes selectively)
- Proposes a three-layer memory hierarchy: I/O layer, cache layer, and memory layer
- Identifies two critical protocol gaps: cache sharing across agents and structured memory access control
- Argues **memory consistency** is the most pressing open challenge (analogous to cache coherence in multiprocessor systems)
- Provides architectural foundations for building reliable, scalable multi-agent systems

---

## Honorable Mentions

| Paper | arXiv | Date | Key Idea |
|-------|-------|------|----------|
| Intrinsic Memory Agents | [2508.08997](https://arxiv.org/abs/2508.08997) | Aug 2025 | Agent-specific memories that evolve intrinsically; generic memory template |
| Collaborative Memory | [2505.18279](https://arxiv.org/abs/2505.18279) | May 2025 | Multi-user memory sharing with dynamic access control via bipartite graphs |
| Memory as a Service (MaaS) | [2506.22815](https://arxiv.org/abs/2506.22815) | Jun 2025 | Service-oriented memory modules for cross-entity collaborative agents |
| AgeMem | [2601.01885](https://arxiv.org/abs/2601.01885) | Jan 2026 | Unified long-term and short-term memory management |
| G-Memory | [2506.07398](https://arxiv.org/abs/2506.07398) | Jun 2025 | Hierarchical memory for multi-agent systems via three-tier graph hierarchy |
| MemGPT | [scholar](https://scholar.google.com/scholar?q=MemGPT) | 2023 | LLMs as operating systems with virtual context management |
