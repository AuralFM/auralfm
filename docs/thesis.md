# The Aural Imaginary and the Platopticon: Extraction, Radicalization, and Revolutionary Intercommunalism in Decentralized Communication Infrastructures

## *A Case Study of AuralFM — A Window onto the World You Can Listen To*

---

## Abstract

This thesis develops a cross-disciplinary theoretical framework bridging cultural studies, critical infrastructure studies, and revolutionary political theory to analyze how decentralized communication technologies — mesh networks, Nostr relays, blockchain systems, shortwave radio, and community media — operate within and against the extractive architectures of late digital capitalism. Drawing on Roshanak Kheshti's concept of the "aural imaginary" and her critique of the world music culture industry, Vladan Joler's cartography of the "New Extractivism" and the Platopticon, and Huey P. Newton's theory of intercommunalism, this work argues that decentralized communication infrastructures occupy a contested position: they are simultaneously potential sites of counter-extractivist resistance and potential targets for absorption by the very imperial systems they seek to circumvent.

The thesis proposes that the most politically consequential decentralized infrastructures are those that function as Newton's "survival programs" — autonomous, community-governed systems that meet material communicative needs while building revolutionary consciousness through the act of participation itself. These counter-extractivist design principles are not merely theoretical. They are already being built, in code, by a single designer who arrived at the same conclusions through practice — and who, upon encountering Kheshti's critique, recognized it immediately as a description of the thing he was building against.

**AuralFM**, a macOS application that renders the Earth as a navigable, listenable globe — combining 38,342 radio stations across 12,296 places in 227 countries with 837 borrowed shortwave receivers, real atmospheric propagation data, and an optional presence layer over Nostr — serves as the central case study. Built by Melton Bell III with the architectural commitment of "offline-first, no backend of our own, collects nothing," AuralFM embodies the counter-extractivist principles this thesis derives theoretically. Its design decisions — the refusal of algorithmic curation, the structural impossibility of dividual assembly, the foregrounding of material infrastructure conditions, the bidirectional communicative capacity that disrupts the aural imaginary — constitute a working proof that the theoretical framework is actionable.

---

## Table of Contents

1. [Introduction: The Wire and the Ear](#1-introduction-the-wire-and-the-ear)
2. [Theoretical Foundations](#2-theoretical-foundations)
   - 2.1 [Kheshti's Aural Imaginary and the World Music Culture Industry](#21-kheshtis-aural-imaginary-and-the-world-music-culture-industry)
   - 2.2 [Joler's New Extractivism and the Platopticon](#22-jolers-new-extractivism-and-the-platopticon)
   - 2.3 [Newton's Intercommunalism and the Survival Programs](#23-newtons-intercommunalism-and-the-survival-programs)
3. [Decentralized Technologies Through the Extractive Lens](#3-decentralized-technologies-through-the-extractive-lens)
   - 3.1 [Mesh Networks: The Contact Zone Made Literal](#31-mesh-networks-the-contact-zone-made-literal)
   - 3.2 [Nostr Relays: Cultures of Circulation Without a Label](#32-nostr-relays-cultures-of-circulation-without-a-label)
   - 3.3 [Blockchain: Incorporeal Materialism's Final Form](#33-blockchain-incorporeal-materialisms-final-form)
4. [Shortwave Radio: The Original Decentralized Network](#4-shortwave-radio-the-original-decentralized-network)
   - 4.1 [Shortwave as Infrastructure of the Periphery](#41-shortwave-as-infrastructure-of-the-periphery)
   - 4.2 [Asymmetry as Feature](#42-asymmetry-as-feature)
   - 4.3 [Emergency as the True Test of Decentralization](#43-emergency-as-the-true-test-of-decentralization)
   - 4.4 [The Hobbyist as Infrastructure Maintainer](#44-the-hobbyist-as-infrastructure-maintainer)
5. [The Platopticon and the Radicalization Pipeline](#5-the-platopticon-and-the-radicalization-pipeline)
   - 5.1 [The Cave as Radicalization Engine](#51-the-cave-as-radicalization-engine)
   - 5.2 [The Affective Extraction–Radicalization Feedback Loop](#52-the-affective-extractionradicalization-feedback-loop)
   - 5.3 [Decentralization as Exit Strategy](#53-decentralization-as-exit-strategy)
6. [Intercommunalism as Political Architecture](#6-intercommunalism-as-political-architecture)
   - 6.1 [The Lumpenproletariat Meets the Ghost Worker](#61-the-lumpenproletariat-meets-the-ghost-worker)
   - 6.2 [Survival Programs as Infrastructure](#62-survival-programs-as-infrastructure)
   - 6.3 [Newton's Critique of Individual Exit](#63-newtons-critique-of-individual-exit)
   - 6.4 [The Aural Imaginary and the Politics of Listening](#64-the-aural-imaginary-and-the-politics-of-listening)
7. [Synthesis: A Unified Framework](#7-synthesis-a-unified-framework)
8. [Case Study: AuralFM as Counter-Extractivist Infrastructure](#8-case-study-auralfm-as-counter-extractivist-infrastructure)
   - 8.1 [The Project and Its Architect](#81-the-project-and-its-architect)
   - 8.2 [The Practitioner Encounters the Critique](#82-the-practitioner-encounters-the-critique)
   - 8.3 [Architectural Refusals as Theoretical Positions](#83-architectural-refusals-as-theoretical-positions)
   - 8.4 [The Shortwave Receiver as Survival Program](#84-the-shortwave-receiver-as-survival-program)
   - 8.5 [Nostr Presence as Revolutionary Intercommunalism in Practice](#85-nostr-presence-as-revolutionary-intercommunalism-in-practice)
   - 8.6 [The Copy Rule: Operationalizing the Anti-Aural-Imaginary](#86-the-copy-rule-operationalizing-the-anti-aural-imaginary)
   - 8.7 [Business Model as Political Statement](#87-business-model-as-political-statement)
   - 8.8 [Where AuralFM Falls Short of Its Own Ideals](#88-where-auralfm-falls-short-of-its-own-ideals)
9. [Counter-Extractivist Design Principles](#9-counter-extractivist-design-principles)
10. [Conclusion: The Shortwave Listener and the Revolutionary Cadre](#10-conclusion-the-shortwave-listener-and-the-revolutionary-cadre)
11. [Bibliography](#11-bibliography)

---

## 1. Introduction: The Wire and the Ear

In the early 2020s, a convergence of crises — pandemic-driven digital acceleration, the proliferation of algorithmic radicalization, the expansion of surveillance capitalism into new affective and cognitive territories, and the simultaneous growth of decentralized communication technologies — created an urgent need for theoretical frameworks capable of analyzing communication infrastructure as a site of both extraction and resistance. The dominant analytical paradigms, drawn separately from cultural studies, media ecology, and political theory, have proven insufficient to account for the full spectrum of forces at work: the cultural shaping of perception, the material extraction of behavioral surplus, and the political organization of communities around autonomous infrastructure.

This thesis addresses that gap by constructing a tripartite theoretical framework that brings three thinkers into sustained dialogue:

**Roshanak Kheshti**, whose work on the "aural imaginary" and the world music culture industry reveals how cultural industries extract affect from racialized and geographically marked bodies, shaping perception before the encounter with the Other even occurs.

**Vladan Joler**, whose cartography of the "New Extractivism" maps the total infrastructure of digital extraction — from Congolese cobalt mines to algorithmic filter bubbles — as a single planetary-scale apparatus that he names the Platopticon.

**Huey P. Newton**, whose theory of intercommunalism — developed in 1970 but astonishingly prescient — identifies the global system of connected communities under imperial control and proposes autonomous community infrastructure as the basis of revolutionary practice.

The central argument is that decentralized communication technologies exist within a field of tension between **reactionary intercommunalism** (communities connected through and mediated by imperial infrastructure) and **revolutionary intercommunalism** (communities connected laterally through autonomous infrastructure). The position any given technology occupies on this spectrum is determined not by its technical architecture alone, but by the social relations of its production, maintenance, governance, and use.

This is not merely a theoretical exercise. The framework developed here is tested against a living project — **AuralFM**, a macOS application built by Melton Bell III, a Black designer from Houston — that independently arrived at counter-extractivist design principles through practice, and whose internal documentation demonstrates a conscious engagement with the same critical literature this thesis employs. AuralFM serves as proof that the theoretical framework is not merely diagnostic but **generative**: it describes not only what is wrong with existing systems but what right systems look like when built.

The thesis proceeds by first establishing each theoretical framework in detail, then applying the combined framework to specific technologies (mesh networks, Nostr relays, blockchain, shortwave radio), then analyzing the mechanism by which extractive platforms produce radicalization, then developing Newton's intercommunalism as the political architecture, then presenting AuralFM as the central case study, and finally proposing a set of counter-extractivist design principles grounded in the convergence of all three frameworks and the case study's lived practice.

---

## 2. Theoretical Foundations

### 2.1 Kheshti's Aural Imaginary and the World Music Culture Industry

Roshanak Kheshti, Professor of Theater, Dance, and Performance Studies at UC Berkeley, developed her concept of the "aural imaginary" through sustained engagement with the world music culture industry — the global apparatus by which music from the Global South is recorded, packaged, marketed, and consumed by primarily Western audiences.

**The Aural Imaginary** refers to the pre-formed set of expectations, fantasies, and desires that shape how Western listeners hear music from racialized and geographically marked Others before the sonic encounter even occurs. Drawing on psychoanalytic theory and postcolonial critique, Kheshti argues that the world music industry does not simply distribute pre-existing music to new audiences. Rather, it actively constructs a **listening subject** (the Western consumer positioned as cosmopolitan discoverer) and a **listened-to object** (the non-Western musician positioned as authentic, primal, spiritually rich).

**Ear Agents** are the intermediaries — producers, A&R representatives, label executives, DJs, curators, festival programmers — who mediate the encounter between the Western listener and the non-Western musician. These agents perform a dual function: they *filter* (deciding which sounds are legitimate "world music") and they *frame* (constructing the narrative context — liner notes, album art, artist biographies — through which the music will be heard). The ear agent's power lies in their ability to shape the aural imaginary itself: to determine what "authentic" sounds like, what counts as "traditional," what is "fusion" versus "contamination."

**Oto-erotic Performance** is Kheshti's term for the pleasurable, almost intimate dimension of listening to the racialized Other. The world music listener derives a specific form of pleasure — simultaneously aesthetic, erotic, and colonial — from the act of hearing a voice marked as authentically different. This pleasure is not innocent; it recapitulates the colonial encounter in sonic form. The listener consumes the Other's voice while remaining structurally separated from the Other's material conditions.

**Communities of Sentiment**, a concept Kheshti adapts from Lee and LiPuma's "cultures of circulation," refers to affective collectivities formed through shared listening practices. A community of sentiment is not a geographic community or an ethnic community — it is a community formed by the shared affect of hearing. The world music culture industry produces communities of sentiment (Western consumers who share a taste for "authentic" global sounds) while simultaneously *disrupting* existing communities of sentiment in the communities of origin (where the music may have served ritual, social, or political functions now displaced by global market circulation).

**Incorporeal Materialism** describes how seemingly immaterial cultural forms — music, atmosphere, affect, the feeling of hearing — produce very real material effects: economic extraction (profits flow from periphery to center), racialized listening (the aural imaginary reinforces racial hierarchies), and colonial desire (the Western listener's pleasure in the Other's voice recapitulates colonial power relations). The "incorporeal" (sound, feeling, imagination) is never separate from the "material" (labor, capital, infrastructure). They are the same process viewed from different angles.

**Cultures of Circulation** names the insight that cultural forms are shaped not just by their content but by the *pathways and forms* through which they move. In the world music industry, the circulation pathway runs unidirectionally from periphery (Global South musicians) through center (Western labels, producers, distributors) to consumer (Western listeners). This pathway is not neutral — it shapes the music itself, determining what sounds travel, how they are transformed in transit, and what context they arrive in.

#### Key Implications for Decentralized Communication

Kheshti's framework provides the cultural-critical dimension that purely technical analyses of decentralized communication lack. It reveals that **decentralizing the technical infrastructure does not automatically decentralize the cultural structures of perception and desire.** The aural imaginary — the pre-formed expectation of what the Other sounds like — persists regardless of whether the signal travels through a centralized server or a mesh node. Ear agents — the curators, filters, and framers — may be displaced by decentralized protocols, but the *function* of curation reasserts itself wherever there is filtering. And communities of sentiment — the affective collectivities formed through shared communicative practice — are shaped as much by the *form of circulation* as by the content that circulates.

### 2.2 Joler's New Extractivism and the Platopticon

Vladan Joler, Professor at the Academy of Arts of the University of Novi Sad and founder of SHARE Lab, published "New Extractivism" in 2020 as a cartographic and conceptual assemblage that maps the total infrastructure of digital extraction. The work, commissioned by Digital Earth for the Vertical Atlas publication, presents 33 interconnected concepts organized as an "assemblage of concepts and allegories" that together constitute what Joler calls a "blueprint of a machine-like superstructure, or a super allegory."

**The Platopticon** is Joler's central allegory: a fusion of Plato's cave and Bentham's panopticon that describes the condition of the contemporary digital subject. In the Platopticon, each user is detained in their own individual cave, watching a personalized spectacle projected on the cave walls by algorithmic systems. Simultaneously, the user's reactions to this spectacle — every click, pause, scroll, emotional micro-response — are surveilled and extracted by the central tower of the panopticon. The Platopticon is thus simultaneously a prison, a factory, and a resource extraction apparatus:

- **Prison**: The user is enclosed in a personalized cave from which exit is structurally prevented by the "event horizon" — the point beyond which the social and economic cost of leaving the platform becomes prohibitive.
- **Factory**: The user performs continuous digital labor — scrolling, liking, sharing, commenting, creating content — that produces value for the platform.
- **Resource extraction apparatus**: Every movement and emotional reaction is recorded continuously, becoming raw material (behavioral surplus) for algorithmic processing and commercial exploitation.

**The Digital Labor Triangle** describes the user's threefold function within the Platopticon. The user is simultaneously:
1. **Worker**: Performing immaterial labor (content creation, engagement, data generation)
2. **Resource**: Producing behavioral surplus through every interaction
3. **Product**: Being sold to advertisers as an attention-commodity

**The Dividual**, following Deleuze's "Postscript on the Societies of Control," names the statistical entity constructed from the user's extracted data. The dividual is not a coherent identity but a "n-dimensional statistical projection" — a multidimensional portrait assembled from millions of data points across hundreds of databases. This dividual is the entity that algorithms act upon: it is clustered, targeted, predicted, and modulated. The user experiences themselves as an individual; the system sees and acts upon the dividual.

**Algorithmic Lenses** are the mathematical functions, machine learning models, and neural networks that process extracted data and shape the projected spectacle. Joler emphasizes that these lenses "embody faults and biases" — but crucially, these are not accidental errors but structural features: "The shape of the algorithmic lenses is carefully crafted to project the image that is in accordance with the platform's financial interest and political goals and values."

**Bubbles** are the personalized territories produced by algorithmic clustering. Users are positioned within "multidimensional ever-changing invisible landscapes" where their dividuals determine which other dividuals they encounter, what content they see, and what affective states they are modulated toward. Bubbles are not merely information filters — they are **affective enclosures** that narrow the range of emotional and cognitive experience.

**New Extractivism** extends the concept of extractivism — originally applied to colonial resource extraction (minerals, timber, agricultural products) — into the digital domain. Joler argues that contemporary extraction reaches "into the furthest corners of the biosphere and the deepest layers of human cognitive and affective being." The territories of extraction include:

- **Body and mind**: Every biometric, emotional, and cognitive signal becomes extractable
- **Behavior**: Shoshana Zuboff's "behavioral surplus" — every action, reaction, and habit rendered as data
- **Attention and emotion**: The "attention economy" and "emotion economy" as new extraction frontiers
- **Nature**: The material infrastructure of digital technology (minerals, energy, water) extracted from the earth
- **Labor**: From Congolese cobalt miners to Foxconn assembly workers to Mechanical Turk ghost workers to unpaid platform users — a "planetary-scale factory" organized through "fractal supply chains"

**Digital Colonialism**, following Renata Avila, describes how "technology empires control the world through data and the ownership of computational power." Joler emphasizes that this is not merely metaphorical: "Traditional colonial practices of control over critical assets, trade routes, natural resources and exploitation of human labor are still deeply embedded in the contemporary supply chains, logistics and assembly lines of digital content, products and infrastructure."

**Beyond the Capture** (Concept #20) poses the central question: "Is there any word or meaning that is not captured by this gigantic meta-structure? How can we investigate but not harm those fragile words or meanings that somehow escaped the capture process? How do we care for and cultivate ecologies that exist beyond the border of capture?"

#### The Platopticon's Policy Declaration

Significantly, Joler's own website (extractivism.online) enacts a counter-extractivist practice through its technical and policy choices:
- Hosting powered by wind energy
- No cookies
- No login or authentication
- Static HTML with optimized images
- Content licensed under CC BY-NC-SA
- A copy hosted on the dark web

This is not incidental. It demonstrates that **counter-extractivist practice can be embedded at the infrastructure level** — in the refusal to capture, the refusal to authenticate, the refusal to track. As we will see in the case study (Section 8), AuralFM arrives at a strikingly similar set of commitments through an entirely independent path.

### 2.3 Newton's Intercommunalism and the Survival Programs

Huey P. Newton, co-founder of the Black Panther Party, developed his theory of intercommunalism in a series of speeches and writings beginning in 1970, most fully articulated in his address at Boston College on November 18, 1970, and in subsequent essays. The theory represents Newton's attempt to update Marxist-Leninist analysis for a world in which, he argued, the nation-state had been superseded by a global imperial system.

**The Core Thesis: The Nation-State Is Dead**

Newton argued that the United States had ceased to be a nation and had become an empire. More radically, he argued that this empire had transformed the entire world into a network of interconnected communities — not as sovereign political units, but as nodes in a single global system of exploitation:

> "The world is a collection of communities connected by the empire."

This was not merely a description of globalization before the term existed. Newton was making a specific political argument: that the traditional Marxist categories of nation, class, and internationalism were no longer adequate to describe a world in which capital, military power, and cultural influence flowed through a single integrated system.

**Reactionary Intercommunalism** names the existing condition: communities linked not by solidarity or mutual aid, but by a shared relationship to the same imperial power. Communication flows through imperial infrastructure. Culture is extracted from the periphery and consumed at the center. Value flows upward. Political power is concentrated in the imperial core. Communities are connected — a farmer in Mali and a factory worker in Detroit are part of the same global system — but their connection is mediated by and serves the interests of the empire.

**Revolutionary Intercommunalism** names the alternative: communities connected directly, laterally, through autonomous infrastructure that bypasses the imperial mediator. In revolutionary intercommunalism:
- Communication flows laterally, not through central nodes
- Culture circulates within and between communities without extractive intermediation
- Value stays local or flows through mutual exchange rather than upward extraction
- Political power is distributed among self-governing communities
- The infrastructure of connection is owned and governed by the communities it connects

**The Lumpenproletariat as Revolutionary Subject**

Newton's most controversial theoretical intervention was his identification of the **lumpenproletariat** — the permanently displaced, the structurally unemployed, the people discarded by automation and imperialism — as the emerging revolutionary subject. Against Marx, who considered this class politically inert and unreliable, Newton argued that:

1. Automation and imperialism were producing a growing class of permanently excluded people
2. This class had no stake in the existing system and therefore no interest in reform
3. Their position outside the formal economy gave them a unique perspective on the system's totality
4. Their material needs made them receptive to revolutionary organization that met those needs directly

**The Survival Programs** were the Black Panther Party's practical embodiment of revolutionary intercommunalism. Far from charity or social services, these programs — free breakfast for children, community health clinics, liberation schools, the Intercommunal Youth Institute, the Oakland Community School, free clothing distribution, sickle cell anemia testing, legal aid, the Black Panther newspaper — were **autonomous infrastructure** built by and for the community, outside the state, that simultaneously:

- **Met material needs**: Feeding children, treating illness, educating youth, providing clothing
- **Demonstrated community capacity**: Proving that the community could feed, heal, teach, and clothe itself without the state or the market
- **Built political consciousness**: The act of participating in these programs was itself political education. Distributing the newspaper was organizing. Staffing the clinic was mutual aid. Teaching in the school was counter-hegemonic practice.
- **Created organizational infrastructure**: The programs built the networks, skills, relationships, and trust that constituted the Party's organizational base

The survival programs were not preparation for revolution — they **were** the revolution in its current form. The revolutionary act was not the future seizure of state power but the present construction of autonomous community capacity.

**The Black Panther Newspaper as Proto-Decentralized Media**

The Black Panther newspaper functioned as the Party's communication infrastructure — its "relay network" in contemporary terms. It bypassed the mainstream media's editorial gatekeepers (what Kheshti would call "ear agents"). It was produced by the community, distributed by community members on street corners, and consumed by the community. The production, distribution, and consumption were all community-controlled. Crucially, the newspaper did not just carry information — the *act of distributing it* built the network, built the organization, and built political consciousness. The infrastructure was the organizing.

---

## 3. Decentralized Technologies Through the Extractive Lens

### 3.1 Mesh Networks: The Contact Zone Made Literal

Mesh networks — community-built wireless infrastructures like NYC Mesh, Guifi.net in Catalonia, and disaster-response mesh deployments — represent the most physically grounded form of decentralized communication. Analyzed through the combined framework:

**Ear Agents Disintermediated.** Kheshti's ear agents — the curators who filter, package, and frame content for consumption — have no structural home in a mesh network. The mesh is a transport layer, not a content platform. There is no intermediary deciding what signal gets amplified. The mesh becomes what Mary Louise Pratt calls a "contact zone": a space where disparate communicative practices meet without a corporate curator shaping the encounter.

**Incorporeal Materialism Made Physical.** Kheshti's concept names how immaterial cultural forms produce material effects. Mesh networks invert this dynamic: they make the *infrastructure itself* visible and tangible. The antenna on a rooftop, the router in a community center, the hand-crimped ethernet cable — these are the material conditions of communication laid bare. In the world music industry, the material infrastructure of listening (recording studios, distribution chains, retail spaces) is deliberately obscured to maintain the fantasy of "authentic" sonic encounter. Mesh networks refuse that obscurity. The infrastructure is legible to the community that builds and maintains it.

**Communities of Sentiment as Infrastructure Communities.** Kheshti's communities of sentiment — affective collectivities formed through shared communicative practices — take on a doubled meaning in mesh networks. The community that *builds and maintains* the mesh is also the community that *communicates through it*. The affective labor of soldering, configuring, and troubleshooting becomes inseparable from the affective labor of communicating and sharing. This collapses the production/consumption divide that Kheshti identifies as central to the world music culture industry's extractive logic.

**Newton's Survival Program Model.** A community mesh network is structurally identical to a survival program: it meets a material need (communication), is built and maintained by the community it serves, builds political consciousness through participation (maintaining the mesh *is* the political education), and demonstrates autonomy (proving the community can communicate without depending on corporate or state infrastructure).

**Joler's Counter-Extractivism.** Mesh networks can reduce the resolution of the user's dividual by eliminating the upstream data harvesting that characterizes corporate ISPs. However, community-run meshes can still implement surveillance at the local level. The physical layer escapes corporate extraction, but the social layer can recapitulate control if governance structures are not consciously designed against it.

### 3.2 Nostr Relays: Cultures of Circulation Without a Label

Nostr (Notes and Other Stuff Transmitted by Relays) is a decentralized protocol for social communication in which users publish signed messages to any number of independently operated relay servers, and clients retrieve and display messages according to user-defined preferences.

**Decentralized Cultures of Circulation.** Kheshti's analysis, drawing on Lee and LiPuma, emphasizes that cultural forms are shaped by the *pathways* through which they move. In the world music industry, circulation is unidirectional: periphery → center → consumer. Nostr's relay architecture shatters this pipeline. Any relay operator can host, any client can connect, any user can publish. The culture of circulation becomes genuinely plural — there is no single pathway, no central node through which all signal must pass.

**Ear Agents Reconfigured, Not Eliminated.** Kheshti's framework demands caution: ear agents don't disappear, they *migrate*. In Nostr, the relay operator becomes a new kind of ear agent — deciding what to store, what to moderate, whether to filter. Client developers become curators through UI/UX decisions about what appears in a user's feed. Algorithmic "trending" implementations within clients replicate the curatorial power of the A&R representative. **Decentralization of infrastructure does not automatically mean decentralization of curation.** The ear agent function is structural; it reasserts itself wherever there is filtering.

**The Aural Imaginary Unmoored.** Nostr is primarily text-based, but its implications for sound are profound. When audio content (voice notes, music, live streams via linked protocols) travels through Nostr, it moves without the aural imaginary that Kheshti critiques — there is no "world music" category imposed, no exoticizing liner notes, no album art designed to trigger colonial desire. Sound arrives *without its pre-packaged imagination.* This is both liberating (sound circulates without racialized/geographic framing) and disorienting (without context, how do communities of sentiment form around shared sonic experience?).

**Pseudonymity and the Oto-erotic Performance.** Kheshti writes extensively about how the world music industry constructs the "authentic" voice of the Other. Nostr's pseudonymous culture — nym culture, key-based identity — fundamentally disrupts this construction. You cannot exoticize a voice whose body is invisible. The oto-erotic performance is short-circuited when identity is cryptographic rather than embodied.

**The Dividual Distributed.** Joler's dividual — the statistical portrait assembled from extracted data — still forms in Nostr, but it is distributed across multiple relay operators rather than centralized in a single platform. Whether this constitutes a meaningful reduction in extractive power depends on whether relay operators collude, whether client applications aggregate across relays, and whether the protocol develops metadata protection features.

### 3.3 Blockchain: Incorporeal Materialism's Final Form

Blockchain technology — distributed ledgers maintained by consensus mechanisms, enabling trustless transactions without centralized intermediaries — represents the most theoretically radical and practically contradictory form of decentralized infrastructure.

**The Ledger as Incorporeal Materialism.** Kheshti's concept reaches its logical extreme in blockchain. Here, the *entire value chain* — from creation to distribution to consumption to royalty — is encoded in an immaterial-yet-irrefutably-material ledger. The blockchain makes explicit what Kheshti argues is always already true: that cultural circulation is never just about meaning but always about material flows of value. Smart contracts for music royalties (Audius, Sound.xyz, Catalog) attempt to disintermediate the ear agents Kheshti critiques by making compensation automatic and transparent.

**Political Economy: Disrupted or Replicated?** Kheshti's framework is most productive as a *critique* of blockchain's revolutionary claims:

- **Token-gated communities** recreate the exclusivity and gatekeeping of the label system. The community of sentiment now requires a financial entry point — you must hold the token to participate in the affective community.
- **Speculative dynamics** financialize attention directly. The listener becomes an investor, the oto-erotic performance becomes a trade. Affective extraction is not eliminated but intensified through financial intermediation.
- **On-chain provenance** could theoretically empower the artists Kheshti champions — establishing origin, preventing extraction, ensuring attribution. But only if the social structures of power are also addressed. Blockchain solves the technical problem of attribution while leaving the cultural problem of the aural imaginary untouched.

**The Dividual Inscribed in Stone.** Joler's dividual — the statistical portrait of the user — becomes, in blockchain, *literally inscribed on an immutable public ledger.* Every transaction, every interaction, every transfer of value is permanently recorded and publicly visible. Far from reducing extractive surveillance, blockchain in many implementations *perfects* it. The dividual is no longer a probabilistic statistical model — it is a deterministic, complete, and permanent record.

**DAOs as Communities of Sentiment with Stakes.** Decentralized Autonomous Organizations represent the most interesting blockchain application through the combined framework. Kheshti's communities of sentiment are affective — they form through shared feeling. DAOs add an economic dimension: the community of sentiment now *co-owns* the cultural object. This could be radical (communities collectively stewarding sonic cultures without extractive intermediaries) or dystopian (the financialization of affect itself). The outcome depends on whether the DAO's governance structure replicates or challenges existing power asymmetries.

**Newton's Critique.** Newton would likely view most blockchain projects with deep skepticism. Token economies, venture-capital-funded foundations, and governance by token-holding plutocracy replicate the very structures of imperial extraction that revolutionary intercommunalism opposes. The "community" governed by a DAO is typically a community of capital, not a community of material need. The survival program feeds children; the DAO optimizes yield.

---

## 4. Shortwave Radio: The Original Decentralized Network

### 4.1 Shortwave as Infrastructure of the Periphery

Shortwave radio — utilizing ionospheric propagation (skywave) to transmit and receive signals across thousands of miles without local infrastructure — occupies a unique position in the genealogy of decentralized communication. Its geography of use maps almost perfectly onto what Kheshti identifies as the **periphery** of the world music culture industry:

- **Africa**: Widely used because local internet and cellular infrastructure can be costly or unreliable
- **South Asia and parts of Latin America**: Relied upon for rural news, religious programming, and long-distance broadcasting
- **Remote and island nations**: Used where physical communication lines are hard to maintain
- **Globally**: Used by hobbyists, survivalists, and emergency responders who value off-grid capability

The regions that most depend on shortwave are the same regions that the world music industry *extracts from* while keeping the means of circulation under Western control. But shortwave inverts this relationship:

**The listener is also the node.** In a mesh network, each participant extends the network. In shortwave, each receiver is a sovereign endpoint. There is no signup, no subscription, no account, no identity verification. The listener turns a dial and the atmosphere becomes the network. This is decentralization at the **physics layer** — ionospheric propagation is indifferent to borders, subscriptions, and sanctions.

**The signal is the infrastructure.** When mesh network builders discuss infrastructure, they imagine routers and antennas as hardware to deploy. Shortwave collapses this distinction: the ionosphere *is* the mesh backhaul, and it requires zero maintenance, zero capital expenditure from the community using it. The only material requirement is a receiver — often inexpensive, simple, and repairable. This is **incorporeal materialism** in its purest form: the atmosphere itself becomes the material substrate of communication.

### 4.2 Asymmetry as Feature

Shortwave is fundamentally asymmetric: powerful transmitters (100kW–500kW) broadcast one-to-many, while receivers are cheap, passive, and ubiquitous. This superficially resembles centralization — but the critical distinction is that the **power asymmetry is in the infrastructure, not in the social relation.**

A listener in rural Congo tuning into BBC World Service is not *producing content* for the BBC. They are not generating data, building engagement metrics, or feeding an algorithm. The relationship is one-directional in signal but **zero-directional in extraction.** The listener cannot be commodified because there is no upstream channel through which their behavioral surplus could flow.

This is the crucial lesson for mesh and Nostr: **decentralization doesn't require symmetric participation.** A Nostr relay doesn't need every user to also be a relay operator. A mesh node doesn't need to originate content. What matters is that the *receiving end is sovereign* — that the listener, the reader, the user retains agency over what they attend to and cannot be surveilled or extracted from in the act of reception.

### 4.3 Emergency as the True Test of Decentralization

Shortwave's popularity in disaster zones — when cell towers fall, when governments cut internet access, when hurricanes destroy fiber optic infrastructure — reveals a fundamental principle:

> *The most decentralized network is the one whose material conditions cannot be destroyed by a single point of failure.*

Shortwave passes this test because its material conditions are **distributed across the atmosphere itself.** No single government can shut down ionospheric propagation (though some attempt to — China's shortwave jamming operations are the equivalent of a state-level Sybil attack on the frequency spectrum).

Mesh networks face a harder version of this test: the physical nodes *can* be destroyed. Nostr relays can be seized. Blockchain nodes can be firewalled. Shortwave teaches decentralized technologists that **true resilience lives in the medium, not in the hardware.** The equivalent design principle: build protocols that can ride on *any* transport — Bluetooth, mesh, carrier pigeon, sneakernet — rather than depending on a specific infrastructure layer.

### 4.4 The Hobbyist as Infrastructure Maintainer

DX clubs (shortwave hobbyists who log distant signals), ham radio operators, and shortwave listening enthusiasts are shortwave's equivalent of mesh network volunteers. They maintain **cultures of circulation** not for profit but for the affective pleasure of the practice — logging a rare signal from Pyongyang, collecting QSL cards, analyzing propagation conditions.

Kheshti would recognize this as a **community of sentiment** formed not around shared consumption of a cultural product, but around shared *participation in the infrastructure of circulation itself.* This maps directly onto:

- **Mesh network builders** who climb rooftops to align antennas
- **Nostr relay operators** who pay for server hosting out of passion
- **Bitcoin node runners** who maintain full nodes for ideological reasons

In each case, the **maintenance labor is the community practice.** The infrastructure doesn't exist *for* the community — the community *is* the maintenance of the infrastructure. This is radically different from the world music culture industry, where the infrastructure (labels, studios, distribution networks) exists to *extract from* the community.

### 4.5 The Continuum of Decentralization

Shortwave → Mesh → Nostr → Blockchain forms a **continuum of decentralization** that progresses from physics to protocol to platform to ledger:

| Technology | Infrastructure Layer | Sovereignty Type | Extraction Level |
|---|---|---|---|
| Shortwave | Atmosphere as infrastructure | Receiver sovereignty | Zero extraction |
| Mesh Networks | Community hardware as infrastructure | Node sovereignty | Minimal extraction |
| Nostr | Relay protocol as infrastructure | Identity sovereignty | Attention economy |
| Blockchain | Consensus mechanism as infrastructure | Asset sovereignty | Financialized extraction |

The critical insight, applying Kheshti's framework, is that **each step toward sophistication risks re-introducing the extractive dynamics of the culture industry.** Shortwave can't extract from you because it literally can't — there's no upstream channel. Blockchain *can* extract from you — through gas fees, token speculation, on-chain surveillance, and the financialization of attention.

---

## 5. The Platopticon and the Radicalization Pipeline

### 5.1 The Cave as Radicalization Engine

Joler's Platopticon — each prisoner detained in their own individual cave, watching a personalized spectacle projected by algorithmic systems — is not merely a surveillance metaphor. It is a **radicalization machine**, and understanding its architecture reveals why.

**Each prisoner gets a personalized play.** Billions of caves, each projecting a different spectacle calibrated to the individual's dividual. The algorithmic lenses, as Joler writes, are *"carefully crafted to project the image that is in accordance with the platform's financial interest."* And what serves financial interest is **engagement** — and what maximizes engagement is outrage, fear, certainty, identity under threat, and the enemy at the gates.

The Platopticon doesn't radicalize by *designing* you to be a fascist or a revolutionary. It radicalizes you by **narrowing your cave until the only shadows you see confirm what you already suspect.** The algorithmic lens diffracts reality through the filter of your behavioral surplus — and what it projects back is a sharpened, simplified, emotionally intensified version of your existing worldview.

**The Radicalization Pipeline, Step by Step:**

**Step 1: Capture → Profiling → Dividual Formation.** Every click, pause, scroll-speed, and emotional micro-reaction is harvested. The dividual — that "n-dimensional statistical projection" — is assembled. The system maps your fears, loneliness, economic anxiety, racial resentments, and unmet need for belonging before you are conscious of them yourself. This is the intelligence-gathering phase of radicalization, and the subject doesn't know they're being recruited.

**Step 2: Algorithmic Lenses → Projection Distortion.** Once profiled, the instruments of measurement and perception begin filtering what enters the cave. These lenses "embody faults and biases" — but these are not accidental biases. They are structural optimizations for affective capture. The algorithm learns that inflammatory content holds attention longer than nuanced content. The lens bends reality toward the affective state that maximizes extraction.

**Step 3: Bubbles → Enclosure → Affective Monoculture.** Users are clustered by their statistical profiles into algorithmic territories. This clustering is the digital equivalent of Kheshti's communities of sentiment — except formed not through shared cultural practice but through shared algorithmic enclosure. Within the bubble, the affective range narrows. Dissent, nuance, and ambiguity are filtered out because they don't optimize for engagement. What remains is a monoculture of affect — pure rage, pure fear, pure certainty.

**Step 4: The Event Horizon.** The point beyond which the social and economic cost of leaving the platform becomes prohibitive. The radicalized subject cannot leave because their entire social world, identity, and community of sentiment *lives inside the cave.* To leave is to lose everything. De-radicalization requires not just changing a mind but **exiting an infrastructure.**

### 5.2 The Affective Extraction–Radicalization Feedback Loop

Kheshti and Joler converge at this critical point. Kheshti's oto-erotic performance — the pleasure of listening to the racialized Other — is, in Joler's framework, one instance of **affective extraction.** The Platopticon extracts *all* affect: outrage, joy, nostalgia, disgust, desire, grief. Every emotional response is captured, quantified, and fed back as behavioral surplus.

**Affective extraction and radicalization are the same process viewed from different angles:**

- **From the platform's perspective**: It is extraction — harvest outrage, sell engagement, profit
- **From the user's perspective**: It is radicalization — consume outrage, identity crystallizes, worldview hardens, community of sentiment forms around shared affect, exit becomes impossible
- **From the system's perspective**: It is optimization — the radicalized user is the most profitable user, most engaged, most predictable, most likely to generate further behavioral surplus

**Radicalization is not a bug in the extractive system. It is the system's most efficient state.** A radicalized user generates more data, more engagement, and more affective surplus than a moderate, curious, ambivalent one. The Platopticon converges on radicalization as the optimal extraction configuration.

**The Material Conditions Produce the Raw Material.** Joler's framework extends beyond the digital to the material base:

- **Digital colonialism creates real grievances.** The Global South is not just a market for platforms — it is the extraction zone. The material extraction produces the economic conditions (precarity, displacement, resource depletion) that make populations vulnerable to radical narratives.
- **The ghost worker sees behind the curtain.** Content moderators, Mechanical Turk laborers, and data labelers have intimate knowledge of the system's failures and manipulations. When this knowledge combines with economic precarity, it produces the informed nihilist — one who knows the system is rigged and sees no legitimate path to reform.
- **Enclosure of the commons closes escape routes.** As more of human experience is captured and commodified, the spaces outside the extractive apparatus shrink. When people feel there is nowhere left to go, radicalization becomes a logical conclusion: if the system cannot be escaped, it must be destroyed.

**The Radicalization Paradox.** The Platopticon doesn't radicalize everyone equally. Its algorithmic lenses calibrate to the dividual, meaning they work most effectively on people whose statistical profile indicates susceptibility. Susceptibility correlates with:

- Economic precarity (produced by material extraction)
- Social isolation (produced by replacement of physical community with platform-mediated interaction)
- Epistemic insecurity (produced by collapse of shared information environments into personalized bubbles)
- Cultural displacement (produced by the same globalizing forces that Kheshti critiques in world music)

The people most targeted for radicalization are the same people most extracted from. Joler's "Eloi and Morlocks" allegory makes this explicit: the Morlocks, who maintain the machinery, are the ones most vulnerable to the machine's projections.

### 5.3 Decentralization as Exit Strategy

Can decentralized technology serve as an exit from the Platopticon? The answer depends on whether it escapes the extractive architecture, not just the centralized one:

| Escape Route | Breaks the Pipeline? | Analysis |
|---|---|---|
| **Shortwave** | ✅ Yes | No upstream channel = no capture. The listener cannot be profiled. The cave wall is blank until the listener tunes the dial. Pure reception without extraction. |
| **Mesh Networks** | ⚠️ Partial | Escapes corporate infrastructure but community-run meshes can still implement surveillance. Physical layer is free; social layer can recapitulate control. |
| **Nostr** | ⚠️ Partial | No central platform, but relay operators see traffic. Client algorithms can still create bubbles. The dividual still forms — distributed across nodes instead of concentrated in one black hole. |
| **Blockchain** | ❌ Often worsens | On-chain activity is perfectly surveillable. Every transaction is public. The dividual is inscribed on an immutable ledger. Token speculation financializes the same affective extraction loop. |
| **Encrypted Messaging** | ✅ Mostly | End-to-end encryption prevents content capture. But metadata still leaks. The social graph — who talks to whom — remains extractable. |
| **AuralFM** (see §8) | ✅ Yes | No account, no analytics, no persistent identity. The Nostr keypair is ephemeral — generated on launch, discarded on close. The presence layer announces the *station's* location, never the listener's. |

The honest answer is that **total escape may be impossible** in a networked world. But the question isn't whether you can fully exit — it's whether you can **reduce the resolution of your dividual** enough to regain cognitive autonomy.

The shortwave listener in rural Mali, turning a dial in a room with no Wi-Fi, hearing a crackling voice from 8,000 miles away — that person is, in that moment, the most free subject in the information age. Not because they have more information, but because the act of receiving it *costs them nothing of themselves.* No dividual is assembled. No behavioral surplus is harvested. No algorithmic lens bends what they hear.

---

## 6. Intercommunalism as Political Architecture

### 6.1 The Lumpenproletariat Meets the Ghost Worker

Newton's identification of the lumpenproletariat as the emerging revolutionary subject finds its contemporary expression in the digital underclass that Joler documents:

| Newton's Lumpenproletariat | Joler's Digital Underclass |
|---|---|
| Displaced by automation | Displaced by "heteromation" — humans called in when machines fail |
| Invisible to the political system | Invisible as "ghost workers" — content moderators, Mechanical Turk laborers, data labelers |
| Living in the gaps of the system | Living in the gaps of the supply chain — Foxconn dormitories, electronics dumps, cobalt mines |
| No stake in the existing order | No stake in the platforms they maintain — can't afford to participate in what they build |

Newton would identify the ghost workers as the lumpenproletariat of the digital age. They see behind the curtain. They know the algorithm is rigged because *they are the ones rigging it.* They moderate the content that radicalizes others. They label the data that trains the models that replaces them. They mine the cobalt that powers the device that surveils them.

This is the most dangerous class — not because they are violent, but because they **know.** And knowledge without power is the raw material of revolutionary consciousness.

### 6.2 Survival Programs as Infrastructure

The Black Panther Party's survival programs provide the definitive template for counter-extractivist infrastructure. Every decentralized technology project should evaluate itself against this model:

**A survival program:**
1. Meets a **material need** (communication, not just connectivity)
2. Is **built and maintained by the community it serves** (not by a foundation, a VC, or a token-holding governance class)
3. **Builds political consciousness** through the act of participation (maintaining the mesh *is* the political education)
4. **Demonstrates autonomy** — proves the community can function without the imperial mediator
5. Is **legible to the community** — people understand how it works, who runs it, where it comes from

**The Black Panther Newspaper was their Nostr relay.** It bypassed the mainstream media's ear agents — the editors, publishers, and advertisers who decided what Black communities could hear. The Panthers printed it, distributed it, sold it on street corners. Production, distribution, and consumption were all community-controlled. The newspaper didn't just carry information — the act of distributing it built the network, built the organization, built consciousness.

**A mesh network antenna on a rooftop in Red Hook, Brooklyn, is the same thing.** The antenna carries data. But the act of climbing the roof, mounting the antenna, configuring the router, teaching the neighbor — that is the survival program. The infrastructure is the organizing.

**AuralFM's shortwave receiver etiquette** (see §8.4) is a survival program in miniature: 837 volunteer machines, governed by seven non-negotiable rules enforced in code, meeting a material need (access to the ionosphere) while building a community of care around shared infrastructure.

### 6.3 Newton's Critique of Individual Exit

Newton would sharply disagree with the libertarian and crypto-anarchist strands of the decentralized technology movement. The decentralized web often frames liberation as individual sovereignty: be your own bank, own your data, control your keys, run your own node. This is the politics of exit — the individual withdrawing from the system.

Newton would respond: **opting out is a fantasy** (confirmed by Joler: "The social cost of opting out has become so high that opting out is essentially a fantasy"). And even if an individual could exit, individual exit does nothing for the community. A single person running a Bitcoin node is not revolutionary. A community collectively governing its own communication infrastructure — that is revolutionary intercommunalism.

**Individual Sovereignty vs. Community Sovereignty:**

| Individual Sovereignty (Crypto/Libertarian) | Community Sovereignty (Newton/Panthers) |
|---|---|
| "I own my data" | "We govern our infrastructure" |
| "I run my own node" | "We maintain our network together" |
| "I hold my own keys" | "We hold the treasury collectively" |
| Exit as liberation | Building as liberation |
| Atomized resistance | Organized infrastructure |

Newton would look at a mesh network and ask: who maintains it? Who governs it? Who decides what runs on it? Does the community that builds it also benefit from it? If the answers point to individual operators optimizing for themselves, it's not revolutionary intercommunalism — it's distributed libertarianism. If the answers point to collective governance, shared maintenance labor, and community benefit, then it's a survival program for the digital age.

### 6.4 The Aural Imaginary and the Politics of Listening

Kheshti and Newton converge on the politics of cultural circulation. Kheshti shows how the world music culture industry constructs an aural imaginary that serves Western consumers. The ear agents mediate the encounter. Music is extracted from communities of origin, repackaged for Western ears, and sold back as "authentic" experience.

Newton would recognize this as **reactionary intercommunalism in the cultural sphere.** The empire connects communities — but only on the empire's terms. A Malian musician can reach a Brooklyn listener, but only through the intermediary of a French label, a British distributor, and an American streaming platform. Each intermediary extracts value. Each intermediary shapes the aural imaginary. The community of origin has no control over how its sound is framed, marketed, or consumed.

**Revolutionary intercommunalism in sound** would mean: communities controlling their own means of sonic production, distribution, and reception. Not "world music" as a marketing category created by Western labels, but music circulating between communities directly — a shortwave broadcast from Bamako heard in São Paulo without passing through any Western intermediary. A Nostr relay in Lagos carrying voice notes to a listener in Manila, with no algorithm deciding what's "trending," no label deciding what qualifies as "world music."

The **community radio station** is the survival program of the airwaves. It is owned by the community, programmed by the community, maintained by the community. It doesn't need the aural imaginary because it doesn't need to sell the community's sound to outsiders. It exists to serve the community's own communicative needs — and in doing so, it builds the lateral connections that Newton identified as the basis of revolutionary intercommunalism.

---

## 7. Synthesis: A Unified Framework

The three theoretical frameworks — Kheshti's cultural critique, Joler's infrastructure cartography, and Newton's political architecture — form an integrated analytical system:

```
KHESHTI                    JOLER                      NEWTON
─────────────────────────────────────────────────────────────────────────────
Aural Imaginary     →   Platopticon          →   Reactionary Intercommunalism
  (how empire           (how empire              (how empire
   shapes hearing)       captures everything)      connects communities
                                                   under its control)

Ear Agents          →   Algorithmic Lenses   →   Imperial Intermediaries
  (who filters           (who distorts             (who mediates
   the sound)             the signal)                the connection)

Communities of      →   Bubbles/Clusters     →   Reactionary Communities
Sentiment               (algorithmically          (connected through
  (formed through         formed,                    the empire,
   shared extraction)     enclosed)                  isolated from
                                                     each other)

Incorporeal         →   Digital Shadow /     →   Circle of Oppression
Materialism             Behavioral Surplus       (the same system
  (the material          (everything you            producing culture
   effects of             do becomes                also produces
   immaterial             extractable               poverty, war,
   extraction)            resource)                  displacement)

Oto-erotic          →   Affective            →   Cultural Imperialism
Performance             Extraction               (pleasure in the
  (pleasure in           (all emotion               Other's voice
   consuming the          becomes                   without solidarity
   Other's voice)         extractable               with the Other's
                          surplus)                   conditions)

Counter-practice:   →   Beyond the Capture   →   Revolutionary
  Decentralized          (spaces outside            Intercommunalism
  Radio / Mesh /          the extractive           (autonomous community
  Shortwave               apparatus)                 infrastructure)
```

**Kheshti** tells us how extraction shapes culture and perception.
**Joler** tells us how extraction operates as total infrastructure.
**Newton** tells us what the system is called (empire), who it exploits (the global lumpenproletariat), and what to build instead (autonomous community infrastructure that meets material needs while building revolutionary consciousness).

**The Integrated Analytical Claim:**

Decentralized communication technologies exist within a field of tension defined by three axes:

1. **Cultural axis** (Kheshti): Does the technology reproduce or disrupt the aural imaginary? Does it create new ear agents or eliminate the function? Does it build communities of sentiment through shared practice or through algorithmic enclosure?

2. **Infrastructural axis** (Joler): Does the technology reduce or increase the resolution of the dividual? Does it extract behavioral surplus or prevent capture? Does its material supply chain extend or contract the territory of extraction?

3. **Political axis** (Newton): Does the technology build revolutionary intercommunalism or merely distribute reactionary intercommunalism? Does it function as a survival program or as a platform? Is it governed by the community it serves or by a separate class of operators, investors, or token holders?

A technology that scores positively on all three axes — disrupting the aural imaginary, preventing extractive capture, and building autonomous community governance — occupies the position of maximum counter-extractivist potential. A technology that scores negatively on any axis risks absorption by the systems it claims to oppose.

---

## 8. Case Study: AuralFM as Counter-Extractivist Infrastructure

### 8.1 The Project and Its Architect

AuralFM is a macOS application built by **Melton Bell III**, a multidisciplinary designer from Houston, working in brand strategy, visual identity, and package design since 2015. The project emerged from a convergence of personal history and technical insight:

**Personal history.** Bell's great-grandmother and grandfather listened to police scanners. His childhood alarm clock was not an alarm — it was the radio coming on, and what came out of it was the Tom Joyner Morning Show. Radio was the technology that was always there while everyone looked past it. This is not nostalgia deployed as marketing; it is the material basis of the project's understanding of radio as **civic infrastructure** — as the medium that connects communities laterally, without the mediation of platforms, algorithms, or editorial gatekeepers.

**Technical insight.** Bell has been building with AI coding tools and encountered the problem every builder in that space encounters: the backend is where it goes wrong. Security breaches, secrets management, data you didn't mean to keep, a server you now have to defend. As he describes it: *"The fast part is the front end and the dangerous part is the back."* The question became: what is the alternative? The answer, arrived at through listening to radio.garden, was immediate: radio stations are already open infrastructure. A product where there is no backend to get wrong — not as an aesthetic preference, not as a cost saving, but as a direct answer to a real engineering problem.

The resulting application is a photoreal globe — real satellite imagery, real day/night terminator, real weather, real sky — that you can listen to. 38,342 radio stations across 12,296 places in 227 countries, plus 837 borrowed KiwiSDR shortwave receivers. The station catalogue lives on the user's machine. Search, browse, and the globe all work with the network unplugged. There is nothing to sign into, nothing that reports back, and nobody keeping a list of what was played.

The project's architectural commitments are three, stated precisely:

1. **Offline-first.** The catalogue, the interface, the globe, and the search all function without a network connection. Only audio playback requires connectivity — because streaming audio is, by its nature, a continuous byte flow from a remote origin.
2. **No backend of our own.** The app has no servers, no accounts, no analytics, no telemetry. It talks to public services (NASA, NOAA, radio.garden, radio-browser.info) but owns none of the infrastructure those services run on.
3. **Collects nothing.** No data about the user leaves the machine. No behavioral surplus is generated. No dividual is assembled.

### 8.2 The Practitioner Encounters the Critique

The most remarkable feature of AuralFM's documentation is `LISTENING.md` — a memo in which Bell engages directly with Kheshti's "Touching Listening" and confronts the uncomfortable parallels between his project and the world music culture industry Kheshti critiques. This is not a case of a theorist applying a framework to an unsuspecting project. It is a case of a **practitioner independently discovering the critique and using it to sharpen his own design decisions.**

Bell identifies the uncomfortable parallels:

> *"Kinship's credo 'everything is closer than you think' de-emphasizes cultural differences, emphasizing instead the universality of music and multicultural aesthetic pleasure. That is the single most uncomfortable line in the paper, because it is four words away from ours: A window onto the world you can listen to."*

> *"A photoreal globe you spin until you find somewhere is a voyage-of-discovery machine. That is the product, said plainly."*

> *"The maintainer is a Black designer, and that does not exempt the product. Kheshti's claim is about the position a product constructs, not about who occupies it. A globe that offers the world's sound as available-on-click builds that position by default, and only stops building it by design."*

This last observation is theoretically precise. Kheshti's argument is structural, not biographical: the aural imaginary is produced by the *architecture of the encounter*, not by the identity of the person who built it. Bell recognizes this and uses it as a design constraint rather than a defense.

He then identifies **three structural answers** that AuralFM already embodies — not as after-the-fact rationalizations, but as architectural decisions that were made before encountering the critique and that happen to address it:

**1. There is no producer.** Kheshti's entire apparatus is mediation: liner notes, album artwork, "modern production values," the label president telling a radio host what to listen for. The listener is taught what they are hearing by someone selling it. AuralFM has nobody in that chair. The station is broadcasting to its own local audience, on its own schedule, for its own reasons. The listener is not being served a curated elsewhere; they are overhearing something not addressed to them. That is, as Bell writes, "a categorically different relation, and it is the most defensible thing about the product."

The corollary is elevated to a design rule: **every editorial layer moves the product toward Kinship** (Kheshti's exemplar label). Tags, "top stations," recommended places, curated collections, mood-based browsing — each one puts someone back in the producer's chair. The refusal of curation is now a design rule with a theoretical reason behind it, not merely a preference.

**2. Captions are the inversion, not a feature.** Kheshti's industry withholds translation because the pleasure depends on not understanding. The oto-erotic performance requires that the Other remain sonic, affective, and unintelligible. Captions do the opposite: they insist on comprehension. The moment a Tehran broadcast becomes a sentence you can read, it stops being texture and becomes speech — someone talking about traffic, or a subsidy, or the weather, in a place you were about to find atmospheric. Bell writes: *"That is the single most anti-aural-imaginary thing the product could do."*

**3. They can answer back.** The aural imaginary is one-directional by construction. The listener builds the Other; the Other never speaks. AuralFM's geohash chat breaks that — someone in the cell you are listening to can reply, and you are no longer the only one authoring the encounter. The window becomes a door.

### 8.3 Architectural Refusals as Theoretical Positions

AuralFM's design decisions, when mapped onto the three-axis framework (cultural, infrastructural, political), reveal a product that systematically refuses the extractive architecture at every layer:

#### Cultural Axis (Kheshti)

| Kheshti's Concept | The Extractive Default | AuralFM's Refusal |
|---|---|---|
| **Ear Agents** | Algorithmic curation, editorial playlists, "recommended for you" | No curation layer. Search is ranked by geography and name, not by engagement. Every editorial addition is a design rule violation. |
| **Aural Imaginary** | The world presented as consumable sonic texture — "hear what Lagos sounds like" | Copy rule: "Hear what Lagos is listening to" — points at people with their own attention, not at ambience. The globe depicts physical conditions of contact, not a representation of culture. |
| **Oto-erotic Performance** | Unintelligibility as product — the Other's voice consumed as pure sound | Captions (when hardware permits) insist on comprehension. Translation disrupts the oto-erotic consumption. |
| **Communities of Sentiment** | Formed through shared consumption, curated by the platform | Formed through shared *infrastructure maintenance* — the receiver operators, the Nostr relay volunteers. |
| **One-directional Encounter** | The listener constructs the Other; the Other never speaks | Geohash chat allows bidirectional communication. Someone in the cell you're listening to can reply. |

#### Infrastructural Axis (Joler)

| Joler's Concept | The Extractive Default | AuralFM's Refusal |
|---|---|---|
| **Capture Agents** | Analytics, telemetry, crash reporting, usage tracking | None. "Nothing about what you listen to is sent to us, because there is no 'us' to send it to." |
| **Algorithmic Lenses** | Engagement-optimized feeds, recommendation engines, trending | None. No algorithm decides what the user sees or hears. |
| **Dividual Assembly** | Persistent identity, cross-session tracking, behavioral profiling | Structurally impossible. No account. The Nostr keypair is ephemeral — generated on launch, discarded on close. No persistent identity exists to accumulate data points. |
| **Bubbles** | Personalized content enclosure based on behavioral profile | The globe exposes the user to what they didn't search for. "Somewhere it is the middle of the night" offers the overnight shows — the hours radio keeps to itself. |
| **Event Horizon** | Social lock-in — the cost of leaving is losing your network | There is no lock-in. No account to lose, no social graph to abandon. The app is a tool, not a trap. |
| **Digital Labor Triangle** | User as worker, resource, and product | The user is none of these. Nothing is extracted. The user listens and that's it. |
| **Behavioral Surplus** | Every interaction generates extractable data | Zero surplus. The only data that leaves the machine is the IP address that any stream requires. |

#### Political Axis (Newton)

| Newton's Concept | Reactionary Default | AuralFM's Position |
|---|---|---|
| **Intercommunalism** | Communities connected through imperial platforms | Communities connected laterally through shared infrastructure — receivers, relays, the ionosphere. |
| **Survival Programs** | State/corporate provision of communication infrastructure | The shortwave etiquette as survival program: community-maintained infrastructure governed by care. |
| **The Newspaper** | Corporate media as intermediary | The Buzz community on Nostr — community and product on the same rails. Not Discord. |
| **Lumpenproletariat** | Dispossessed as passive consumers | The hobbyist, the DXer, the volunteer receiver operator — people whose unpaid maintenance labor makes the system possible. |
| **Community vs. Individual** | Atomized sovereignty ("be your own bank") | Community sovereignty — the etiquette rules govern shared resources, the Nostr relay selection is geo-aware (connecting to nearby relays, not distant ones). |

### 8.4 The Shortwave Receiver as Survival Program

AuralFM's integration of 837 KiwiSDR shortwave receivers is the project's most theoretically rich feature. Each receiver is a private individual's antenna — someone's dipole in Iceland, a dish on Chatham Island, a wire strung across a Bavarian garden, a military wideband dipole at a Cold War coastal fortress in Sweden — connected to the internet and left open for strangers to borrow.

This is the **only audio in the application that is not a stream server.** Every internet radio station in the catalogue is an Icecast, Shoutcast, or HLS endpoint sitting on somebody's server. The shortwave receivers are different: the signal reaches the antenna off the ionosphere with no company in the middle. That is the part of the app that is not a CDN.

The design rules governing receiver access, documented in `DECENTRALIZATION.md` and enforced in code, constitute a survival program's governance structure:

1. **Never auto-connect.** A receiver is only contacted on an explicit click.
2. **One session at a time.** Ever.
3. **Respect capacity limits** — grey out full receivers rather than trying and failing.
4. **Never retry a refused receiver.** Offer a different one.
5. **Honor inactivity timeouts** rather than defeating them with keepalives.
6. **Refresh the receiver list on the crawl schedule, not at runtime.**
7. **Send a contactable User-Agent.**

Bell documents the stakes: *"KiwiSDR is 849 hobbyists paying their own bandwidth, and the same carelessness would be 849 times worse."* He records that AuralFM has already knocked three receivers offline through careless probing, and writes: *"If we cannot commit to all seven, we should not ship it. Burning 849 volunteers to add a feature would be a worse outcome than not having the feature."*

This is Newton's survival program ethic applied to digital infrastructure: the community that maintains the resource is the community that uses it, and the governance structure exists to **protect the community from the users** — including the app itself. The infrastructure is commons, and the etiquette is the commons' constitution.

### 8.5 Nostr Presence as Revolutionary Intercommunalism in Practice

AuralFM's optional presence layer — geohash-based chat over Nostr — is the project's most explicit engagement with decentralized communication infrastructure. The implementation makes a series of design decisions that map directly onto the theoretical framework:

**Never the user's location.** The coordinates announced over Nostr are the *station's*, rounded to a four-character geohash (~20 km). Someone in Houston listening to Rio appears in Rio's channel. This inverts the default assumption of social platforms (announce where *you* are) and instead creates a presence structured around **what you are listening to** — a community of sentiment in Kheshti's sense, but one that is geographically anchored to the source, not the consumer.

**No account.** The keypair is generated when the app opens and thrown away when it closes. A stable key would make you the same person across sessions — would begin assembling a dividual. The ephemeral key makes this impossible.

**No server of ours.** Relays are other people's and interchangeable. The relay directory is geo-aware: relays are chosen by distance to the station, not hardcoded. Bell documents that three hardcoded servers saw 16 peers where a geo-aware list saw 328.

**Ephemeral event kind.** The Nostr events use an ephemeral kind, which relays are asked not to retain. But Bell, demonstrating the same infrastructural honesty that characterizes the entire project, notes that "testing found an announcement replayed after the fact" — so the payload is "built to be worthless if kept rather than relying on the promise." This is the counter-extractivist principle applied at the protocol level: don't trust the system's promises; design so that betrayal is harmless.

**Speaking bitchat's convention.** Rather than inventing a private protocol (which would create an empty room), AuralFM speaks bitchat's geohash format — a public-domain convention that already has users. Every message carries bitchat's `teleport` tag because the cell is always the station's and never the listener's. This is a deliberate choice to **join an existing culture of circulation** rather than attempt to create a new one — a recognition, consistent with Kheshti's framework, that the form of circulation shapes the community as much as the content.

**The honest expectation.** Bell writes: *"Inhabited, but quiet. Hundreds announce presence; actual conversation is thin. It is a room with people in it rather than an empty one, which is a different and better problem."* This is the honest texture of revolutionary intercommunalism in its early stages: not a thriving movement, but a seed — a convention being established, a community being grown, one listener at a time.

### 8.6 The Copy Rule: Operationalizing the Anti-Aural-Imaginary

Perhaps the most theoretically precise design decision in AuralFM is a copy rule, documented in `LISTENING.md`:

> *Never describe a place as a sound. "Hear what Lagos sounds like" is the aural imaginary in five words. "Hear what Lagos is listening to" is not — it points at people with their own attention, not at ambience.*

This single sentence operationalizes Kheshti's entire critique as a writing constraint. "Hear what Lagos sounds like" constructs Lagos as sonic texture — as the raw material for the Western listener's oto-erotic consumption. "Hear what Lagos is listening to" repositions Lagos as a place where people are already listening, already curating, already building their own communities of sentiment — and you, the outsider, are overhearing something not addressed to you.

The distinction is not cosmetic. It is the difference between **reactionary intercommunalism** (the empire makes the periphery available for the center's consumption) and **revolutionary intercommunalism** (communities communicate on their own terms, and outsiders can listen in without controlling the encounter).

### 8.7 Business Model as Political Statement

AuralFM's business model decisions, documented in `BUSINESS.md`, constitute a political position as rigorous as any in the technical architecture:

**The app is free on every platform, forever. No limits, no sign-up, no paid tier, no advertising.** Bell explains: *"There is nothing to buy because there is nothing that could be sold without breaking the promise. To put a feature behind a paywall the app would have to know whether you paid, and every way of knowing that means an account, a licence key tied to a purchase, or a server to ask."*

**A paywall is the one feature that cannot be built without collecting something.** This is the entire reason the decision is clean rather than a sacrifice. The dormant palette paywall in the source code was deleted rather than activated — not because palettes shouldn't be beautiful, but because gating them would require the app to learn something about its users.

**Support is patronage, delivered outside the app.** Following Obsidian's model: the app is free, local, and accountless; anything paid is an optional service you can decline without losing the product. A supporter tier ($5/month recurring) delivers early builds, a badge, and a private channel in Buzz — all delivered *outside the application*. The app never learns that anyone paid.

**What is being sold is independence, not features.** In Obsidian's own words: staying "100% user-supported, free from investor influence." For a product whose entire argument is that it answers to nobody, that is the most honest thing it could sell.

**Bitcoin is refused as a donation mechanism.** Bell identifies, with characteristic precision, that a plain Bitcoin address is one of the *worst* options for donor anonymity: "The ledger is public and permanent. Publish one address and every donation to it is visible forever, along with the address it came from." A project whose whole claim is privacy should not arrange for every supporter to be published. Monero, which is private by protocol, is recommended instead.

**Value4Value / Lightning is considered and refused on structural grounds.** "Radio has no equivalent of the `podcast:value` tag. Building that registry means building a server — the exact thing the whole position rejects." The only acceptable version: if a station *already* publishes a Lightning address in its metadata, a zap button appears. Zero infrastructure, no registry, no server. If nobody publishes one, the feature quietly does not appear.

This is Newton's survival program economics: the community funds itself, on its own terms, without creating the structures of extraction that would compromise its autonomy.

### 8.8 Where AuralFM Falls Short of Its Own Ideals

A rigorous case study must identify where the subject falls short. AuralFM's own documentation is unusually honest about this, and the gaps are instructive:

**"Serverless" is not true, and the project knows it.** Bell's `DECENTRALIZATION.md` corrects the language: the app has no backend *of its own*, but it talks to radio.garden, radio-browser, NASA GIBS, Open-Meteo, and others — all servers. Adding Nostr does not remove servers; relays are servers. Half of the best-known Nostr relays refused the connection on the day of testing. The honest language is "no backend of our own" or "nothing to sign into."

**"Offline-first" is true of the catalogue, not the audio.** All 38,342 stations are stream endpoints. You cannot hear a single one offline. What *is* genuinely offline-first: the places, the search, the globe, the Earth textures, the star catalogue. Unplug the network and the app is still a working atlas of the world's radio — but not a working radio.

**The tagline is acknowledged as a problem.** "A window onto the world you can listen to" is, as Bell writes, "Kinship's credo in nicer clothes — one-way, distance-collapsing, the world rendered available." The deck already suspected this; Kheshti supplied the argument for fixing it. A window is one-way. The chat makes it a door. The tagline hasn't caught up yet.

**Captions don't keep up.** The most anti-aural-imaginary feature in the app is, on current hardware, too slow to be useful. Whisper runs entirely on-device (no cloud speech API — sending audio somewhere would mean transmitting what you're listening to), but `whisper-base` takes 39.6 seconds to transcribe 6 seconds of audio on a 2019 Intel Mac. The plumbing is complete; the hardware isn't there yet. This is a real tension: the feature most aligned with the theoretical framework is the one the project can't deliver.

**Presence is an empty room.** The Nostr geohash chat works — verified between instances — but nobody else is running AuralFM yet, and geotagged Nostr traffic generally is thin. The project is seeding a convention rather than joining a thriving one.

**No spam defense in chat.** The project shares a public channel with anyone and implements no proof-of-work. Fine at current traffic; "embarrassing at ten times it."

**The MeshLLM proposal is refused on its own terms.** An external architecture document proposed pooling community compute to power in-app features. Bell refuses: *"Routing a listener's audio through a community member's GPU means that community member can read it. Compared with Hugging Face — which receives weights requests and never the audio — this is not more private. It is a named individual seeing what a stranger is listening to."* This is Newton's critique of individual sovereignty applied technically: community infrastructure must protect the individual *within* the community, not just from external actors.

These gaps are not failures. They are the **honest texture of building counter-extractivist infrastructure in a world designed for extraction.** The project's documentation is more rigorous about its own limits than most academic work is about its subjects. That rigor is itself a counter-extractivist practice: the refusal to oversell, to inflate, to promise more than the architecture can deliver.

---

## 9. Counter-Extractivist Design Principles

Synthesizing the combined framework and the AuralFM case study into actionable principles for decentralized communication infrastructure:

**Principle 1: No Upstream Channel for Affective Capture**

Shortwave's defining feature; AuralFM's most guarded commitment. The act of receiving must not produce extractable data. The user's attention, emotion, and behavior during reception must remain sovereign — invisible to the system. This is the most fundamental counter-extractivist requirement, and it is the one most consistently violated by contemporary decentralized technologies.

*AuralFM implementation:* No analytics, no telemetry, no crash reporting. The Nostr presence announces the station's location, never the listener's. The keypair is ephemeral.

**Principle 2: No Algorithmic Lenses**

The user must encounter unfiltered, un-optimized signal — even if it is noisy, boring, or uncomfortable. The "lens" must be transparent glass, not a funhouse mirror. Content ordering, when necessary, must be legible, auditable, and user-controlled rather than opaque and engagement-optimized.

*AuralFM implementation:* Search is ranked by geography and name. No recommendation engine. No "for you" feed. No trending. Every editorial addition is a design rule violation with a theoretical reason.

**Principle 3: No Dividual Assembly**

Infrastructure must be designed so that no single actor can assemble a statistical portrait of the user. This requires distributed identity, no persistent logging, no cross-node correlation, and metadata protection. The user's dividual should be impossible to construct — not because of a policy promise, but because the system architecture makes assembly structurally impossible.

*AuralFM implementation:* No account. No persistent identity. The Nostr keypair is generated on launch and thrown away on close. State is local and deletable.

**Principle 4: Communities of Sentiment as Communities of Maintenance**

Joler's ghost workers are invisible. Newton's survival programs make labor visible and shared. Counter-extractivist infrastructure requires that the community which maintains the network is the same community that uses it, and that this shared labor creates bonds stronger than algorithmic clustering. The infrastructure is the organizing.

*AuralFM implementation:* The 837 receiver operators. The etiquette rules enforced in code. The Buzz community on Nostr — same rails as the product. The agent that answers radio questions but never speaks for the maintainer.

**Principle 5: Material Honesty**

Joler's fractal supply chains are black boxes. Counter-extractivist infrastructure reveals its own material costs — the energy, the labor, the minerals, the environmental impact. A mesh network whose builders know where their routers came from, what minerals they contain, and where they will end up when discarded is more resistant to capture than one that treats hardware as magic.

*AuralFM implementation:* The app tells you *why* a band is dead ("solar flux 127 is too low for 28.4 MHz"). The receiver list shows capacity. The globe draws the ionosphere as propagation arcs from real WSPR reports. Every live service is documented with what it costs somebody.

**Principle 6: The Right to Be Boring**

The Platopticon optimizes for engagement, which means it optimizes for intensity. Counter-extractivist spaces must protect the right to be unengaging — to exist without generating surplus, to listen without reacting, to be present without performing. The most radical communicative act may be the one that generates no extractable signal.

*AuralFM implementation:* Radio runs whether or not you engage. No engagement metrics. No "trending." No social pressure to perform. The presence layer is off by default. You can just listen.

**Principle 7: Governance by Material Need, Not by Capital**

Newton's survival programs were governed by the community's material needs, not by investors' returns. Counter-extractivist infrastructure must be governed by those it serves — not by foundation boards, venture capitalists, or token-holding plutocrats. The question is always: who decides, and in whose interest?

*AuralFM implementation:* Free forever. Patronage supports independence, not features. The app never learns who paid. What is sold is the project's freedom from investor influence.

**Principle 8: The Infrastructure Must Demonstrate Autonomy**

Newton's survival programs proved that the community could feed, heal, teach, and clothe itself without the state. Counter-extractivist communication infrastructure must prove that the community can communicate without the platform, the ISP, the relay, or the chain. The demonstration of autonomy is itself a political act.

*AuralFM implementation:* Unplug the network and the globe still works. The catalogue, the search, the places — all local. The app is functional as an atlas even when it cannot play audio.

**Principle 9: Legibility Over Sophistication**

Shortwave's genius is its legibility: anyone can understand how a radio works, anyone can turn a dial, anyone can hear the signal. Counter-extractivist infrastructure must be legible to the community that maintains it. When infrastructure becomes so complex that only specialists can understand it, a new class of ear agents — technical gatekeepers — inevitably emerges.

*AuralFM implementation:* The globe depicts physical conditions, not cultural representations. The band outlook is a rule of thumb, stated as such. The receiver etiquette is seven rules, each with a plain-English reason. The documentation is exhaustive, public, and honest about limits.

**Principle 10: The Right to Be Forgotten**

The Platopticon remembers everything. The dividual is an accumulation of every trace. Counter-extractivist infrastructure must build forgetting into its architecture — ephemeral messages, rotting logs, decaying data. The right to be forgotten is not just a privacy right; it is a condition for the possibility of change, growth, and political transformation.

*AuralFM implementation:* The Nostr keypair dies when the app closes. Ephemeral event kinds ask relays not to retain. The payload is designed to be worthless if kept. State is local and deletable with a single click.

---

## 10. Conclusion: The Shortwave Listener and the Revolutionary Cadre

The most honest decentralized radio project is one that asks: can we build digital infrastructure with the same extractive impossibility as a shortwave receiver? Where the act of listening, reading, receiving is fundamentally uncommodifiable — not because of a protocol rule, but because the physics of the system make extraction structurally impossible?

This thesis has argued that three theoretical frameworks — Kheshti's aural imaginary, Joler's new extractivism, and Newton's intercommunalism — converge on a single set of design principles for communication infrastructure that resists absorption by the extractive systems it exists within. And it has demonstrated, through the case study of AuralFM, that these principles are not merely theoretical aspirations but **achievable engineering decisions** — made by a single designer, in code, with no institutional backing, no venture capital, and no audience beyond himself.

The shortwave listener in rural Mali, turning a dial in a room with no Wi-Fi, hearing a crackling voice from 8,000 miles away — that person is, in that moment, the most free subject in the information age. Not because they have more information, but because the act of receiving it costs them nothing of themselves. No dividual is assembled. No behavioral surplus is harvested. No algorithmic lens bends what they hear.

The Platopticon cannot radicalize what it cannot see. And it cannot see the shortwave listener.

AuralFM is the software embodiment of that position. It is not perfect — its own documentation is more honest about its gaps than this thesis could be. But it proves something that the theoretical framework alone cannot: that the counter-extractivist position is **buildable.** That a product can refuse algorithmic curation and still be beautiful. That a social layer can exist without an account. That 837 strangers' antennas can be governed by care rather than exploitation. That the copy in an app can refuse to describe a place as a sound.

That is the lesson for every decentralized technology builder: the most radical act may not be building a better network. It may be building one that forgets you exist.

Newton would add: and the most revolutionary network is not the one with the most sophisticated protocol, the most censorship-resistant relay architecture, or the most elegant consensus mechanism. It is the one that feeds the children while it carries the signal. The one whose maintenance is the organizing. The one that proves, in its very existence, that the community does not need the empire to speak, to hear, or to survive.

The empire creates the wound, then sells the poison. The survival program heals the wound by building the alternative. Every antenna mounted on a rooftop, every relay configured in a basement, every shortwave dial turned in a room without Wi-Fi — these are not hobbies. They are not technical exercises. They are, in Newton's words, **survival programs pending revolution.**

The question Newton would press — the question every decentralized technology builder, community radio operator, mesh network volunteer, and Nostr relay host should sit with — is:

> *Are you building infrastructure that makes your community less dependent on the empire? Or are you building tools that the empire will eventually absorb, commodify, and use to deepen its reach?*

The empire has done this before. It absorbed the counterculture and sold it back as fashion. It absorbed hip-hop and sold it back as world music. It absorbed the internet and built the Platopticon. It is already absorbing blockchain, mesh, and decentralized social media. The challenge is to build infrastructure so deeply rooted in community governance, so materially connected to community needs, so legible to the people who maintain it, that the empire cannot absorb it without destroying it — and destroying it would reveal the empire for what it is.

AuralFM, with its photoreal globe and its borrowed antennas and its ephemeral keypairs and its copy rule that refuses to call Lagos a sound — this is what that infrastructure looks like when someone actually builds it. Not as a manifesto. Not as a whitepaper. As a macOS app that you can listen to.

---

## 11. Bibliography

### Primary Sources

- Kheshti, Roshanak. "Touching Listening: The Aural Imaginary in the World Music Culture Industry." *American Quarterly* 63:3 (2011), 711–731.
- Kheshti, Roshanak. *Modernity's Ear: Listening to Race and Gender in World Music*. NYU Press, 2015.
- Joler, Vladan. "New Extractivism." extractivism.online, 2020. Commissioned by Digital Earth for the Vertical Atlas publication.
- Joler, Vladan and Kate Crawford. "Anatomy of an AI System: The Amazon Echo As An Anatomical Map of Human Labor, Data and Planetary Resources." AI Now Institute and SHARE Lab, September 7, 2018. anatomyof.ai
- Joler, Vladan and Matteo Pasquinelli. "The Nooscope Manifested: Artificial Intelligence as Instrument of Knowledge Extractivism." Visual essay, KIM HfG Karlsruhe and SHARE Lab, May 1, 2020. nooscope.ai
- Newton, Huey P. "Intercommunalism." Address at Boston College, November 18, 1970.
- Newton, Huey P. *Revolutionary Suicide*. Writer's and Readers Publishing, 1973.
- Newton, Huey P. *To Die for the People: The Writings of Huey P. Newton*. Random House, 1972.

### Case Study Source

- Bell, Melton III. *AuralFM*. macOS application and project documentation. github.com/meltonbell3/auralfm, 2026.
  - `README.md` — Project overview and architecture
  - `PLAN.md` — Full design record
  - `docs/VISION.md` — Why this exists
  - `docs/DECENTRALIZATION.md` — The position, in detail
  - `docs/LISTENING.md` — Engagement with Kheshti's critique
  - `docs/BUSINESS.md` — Free forever, and how support works
  - `docs/COMMUNITY.md` — The Buzz community
  - `docs/DECK.md` — The pitch narrative
  - `docs/PRIVACY.md` — Everything stored locally
  - `docs/ROADMAP.md` — What is next, what is refused
  - `docs/DIRECTION.md` — Architectural direction
  - `docs/IDENTITY.md` — The mark, the colour, the icon
  - `docs/PRODUCT.md` — Positioning as a standalone app
  - `docs/INTERFACE.md` — Interface discipline
  - `docs/LEGAL-AND-SECURITY.md` — Regulatory exposure
  - `docs/SPONSORSHIP.md` — The funding playbook
  - `docs/TERMS.md` — Plain-language terms

### Theoretical Sources

- Avila, Renata. "Digital Colonialism." Digital Future Society, 2020.
- Baudrillard, Jean. *Simulacra and Simulation*. 1981.
- Bentham, Jeremy. *The Panopticon Writings*. 1787.
- Borges, Jorge Luis. "On Exactitude in Science." 1946.
- Brunton, Finn and Helen Nissenbaum. *Obfuscation: A User's Guide for Privacy and Protest*. 2015.
- Campagna, Federico. *Technic and Magic: The Reconstruction of Reality*. 2018.
- Debord, Guy. *The Society of the Spectacle*. 1967.
- Deleuze, Gilles. "Postscript on the Societies of Control." 1992.
- Deleuze, Gilles and Félix Guattari. *A Thousand Plateaus: Capitalism and Schizophrenia*. 1980.
- Deseriis, Marco. "The Politics of Condividuality." 2018.
- Drulhe, Louise. *Critical Atlas of Internet*. louisedrulhe.fr/internet-atlas/
- Ekbia, Hamid R. and Bonnie A. Nardi. *Heteromation, and Other Stories of Computing and Capitalism*.
- Feld, Steven. "A Sweet Lullaby for World Music." In *The Sound Studies Reader*, edited by Jonathan Sterne. Routledge.
- Fuchs, Christian. *Digital Labour and Karl Marx*. Routledge, 2014.
- Gray, Mary L. and Siddharth Suri. *Ghost Work: How to Stop Silicon Valley from Building a New Global Underclass*. 2019.
- Haggerty, Kevin D. and Richard V. Ericson. "The Surveillant Assemblage." 2003.
- Herman, Edward S. and Noam Chomsky. *Manufacturing Consent: The Political Economy of the Mass Media*. 1988.
- Hilmes, Michele. *Radio Voices: American Broadcasting, 1922–1952*. University of Minnesota Press, 1997.
- Ihde, Don. *Listening and Voice: Phenomenologies of Sound*. SUNY Press, 2007.
- Kücklich, Julian. "Precarious Playbour." 2005.
- Lee, Benjamin and Edward LiPuma. "Cultures of Circulation: The Imaginations of Modernity." *Public Culture* 14(1), 2002.
- Lukic, Kristian. "Colonization with Love." SHARE Lab, 2016.
- Orwell, George. *Nineteen Eighty-Four*. 1949.
- Pasquinelli, Matteo. "Metadata Society." In *Posthuman Glossary*, edited by Rosi Braidotti and Maria Hlavajova. Bloomsbury, 2018.
- Plato. *The Republic*, Book VII (Allegory of the Cave).
- Pratt, Mary Louise. *Imperial Eyes: Travel Writing and Transculturation*. Routledge, 1992.
- Radano, Ronald and Philip V. Bohlman, eds. *Music and the Racial Imagination*. University of Chicago Press, 2000.
- Schafer, R. Murray. *The Soundscape: Our Sonic Environment and the Tuning of the World*. Destiny Books, 1994.
- Shiva, Vandana. *The Enclosure and Recovery of The Commons: Biodiversity, Indigenous Knowledge, and Intellectual Property Rights*. 1997.
- Solow, Barbara L. "Capitalism and Slavery in the Exceedingly Long Run." *Journal of Interdisciplinary History* 17(4), 1987.
- Sterne, Jonathan. *The Audible Past: Sound and the Origins of Modernity*. Duke University Press, 2003.
- Sterne, Jonathan, ed. *The Sound Studies Reader*. Routledge.
- Suisman, David. *Selling Sounds: The Commercial Revolution in American Music*. Harvard University Press, 2009.
- Thompson, Emily. *The Soundscape of Modernity: Architectural Acoustics and the Culture of Listening in America, 1900–1933*. MIT Press, 2002.
- Wark, Mckenzie. *Molecular Red: Theory for the Anthropocene*. 2016.
- Wells, H.G. *The Time Machine*. 1895.
- Zuboff, Shoshana. *The Age of Surveillance Capitalism*. 2019.

### Technical and Movement Sources

- NYC Mesh. nycmesh.net
- Guifi.net. guifi.net
- Nostr Protocol. nostr.com
- Audius. audius.co
- Black Panther Party Survival Programs. Various archival sources.
- KiwiSDR. rx.kiwisdr.com
- radio.garden. radio.garden
- radio-browser.info. radio-browser.info
- bitchat. github.com/permissionlesstech/bitchat
- georelays. github.com/permissionlesstech/georelays

---

*Document compiled from research conducted August 2026.*
*All theoretical frameworks applied with respect to their original contexts and the political commitments of their authors.*
*Case study materials used with reference to the project's public documentation and source code.*
