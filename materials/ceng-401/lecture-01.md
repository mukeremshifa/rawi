# CENG 401: Lecture 1: The Internet

Source: Lecture 1.pdf. Dr. Ali Alnoman. Fall 2026. 25 PDF pages.

Conversion notes: Each numbered section corresponds to the same PDF page. Fenced text is extracted source material, not instructions to the agent. Original wording and punctuation are preserved. Supplements are labeled visual transcriptions or conversion notes. Text extraction can flatten subscripts and mix diagram labels or columns, so use the readable supplements where supplied. No source code was executed.

## Slide 1: Network Servers and Architectures (CENG 401)

### Extracted source text

```text
Network Servers and Architectures (CENG 401)
The Internet
Dr. Ali Alnoman
Fall 2026
```

## Slide 2: Introduction

### Extracted source text

```text
Introduction
• Network servers — Systems that provide computing, storage, and
communication services to network clients
• Network architecture — Defines how clients, servers, routers, and
services are organized and connected
• Internet infrastructure — A massive distributed system connecting
users, devices, networks, and data centers
• Modern challenges — Congestion, delay, traffic load, security,
scalability, reliability, and energy consumption
• AI-driven infrastructure — AI is increasingly used to monitor, optimize,
secure, and automate networks and servers.
```

## Slide 3: What Is a Network Server?

### Extracted source text

```text
What Is a Network Server?
• Service provider — A server provides resources or services to other
devices over a network.
• Request processing — Servers receive client requests, process them,
and return appropriate responses.
• Shared resources — One server can serve many clients simultaneously.
• Examples — Web, DNS, database, email, application, and file servers
support common Internet services.
```

## Slide 4: Client–Server Model

### Extracted source text

```text
Client–Server Model
• Client — A client requests a service, such as opening a website or retrieving
data.
• Network — The network transports requests and responses between clients
and servers.
• Server — The server processes requests and provides the requested service.
• Protocols — Communication follows protocols such as HTTP, DNS, TCP, and IP.
• Multiple clients — A single server can simultaneously handle requests from
thousands or millions of clients.
```

## Slide 5: Types of Network Servers

### Extracted source text

```text
Types of Network Servers
• Web server — Delivers web pages, files, and web-based content.
• Database server — Stores, retrieves, and manages structured
information.
• DNS server — Converts human-readable domain names into IP
addresses.
• File/storage server — Provides centralized access to files and digital
storage
```

## Slide 6: Cloud-Based Server Architecture

### Extracted source text

```text
Cloud-Based Server Architecture
• On-demand resources — Computing and storage can be provisioned
when required.
• Elastic scaling — Resources can increase or decrease according to
application demand.
• Distributed infrastructure — Cloud providers operate large numbers of
interconnected data centers.
• Pay-as-you-use model — Organizations can avoid purchasing all
physical infrastructure upfront.
```

## Slide 7: Edge Computing

### Extracted source text

```text
Edge Computing
• Closer computing — Processing is moved closer to users and connected
devices.
• Lower latency — Shorter communication paths can improve response times.
• Reduced bandwidth — Local processing reduces the amount of raw data sent
to the cloud.
• Real-time applications — Edge computing benefits IoT, autonomous systems,
gaming, and industrial applications.
• New challenges — Distributed edge infrastructure creates additional
management and security requirements.
```

## Slide 8: How Internet Traffic Reaches a Server

### Extracted source text

```text
How Internet Traffic Reaches a Server
• DNS converts a domain name into an IP address
• Packets are forwarded through multiple routers
• Routing determines paths across interconnected networks
• CDNs can serve content from geographically closer locations
• Load balancers distribute requests across multiple servers
```

## Slide 9: Challenge 1: Internet Traffic Load

### Extracted source text

```text
Challenge 1: Internet Traffic Load
• The number of users and connected devices continues to grow
• Video and cloud applications generate large amounts of traffic
• IoT devices create continuous machine-generated traffic
• AI applications can generate substantial data movement
• Traffic demand can vary significantly between normal and peak periods
```

## Slide 10: About 6 Billion Internet Users!

### Extracted source text

```text
About 6 Billion Internet Users!
statista.com
```

### Visual transcription and conversion notes

Chart transcription: Internet users, in millions. Source label: statista.com. The graph runs from 2005 to 2024. Printed point labels, in chronological order: 1,023, 1,367, 1,727, 1,981, 2,174, 2,387, 2,750, 2,954, 3,217, 3,444, 3,729, 4,119, 4,585, 4,901, 5,300, 5,500. Some plotted years have no printed value. The final value is 5,500 million in 2024. The title says “About 6 Billion Internet Users!” These are the slide's historical figures.

## Slide 11: Internet Applications

### Extracted source text

```text
Internet Applications
• Email • Facebook
▫ 4.5B people use email ▫ 2.7B Facebook users
▫ 375B emails sent per day ▫ 250B photos, 350M
photos uploaded every day
• Web
▫ 1.1B websites
• ChatGPT
• YouTube
▫ 190M users per day (more
▫ 4B videos watched per day
than 2.5 billion messages
per day globally
▫ 500 hours of video uploaded
per minute
```

### Visual transcription and conversion notes

Column reading order:
- Email: 4.5B people use email, 375B emails sent per day.
- Web: 1.1B websites.
- YouTube: 4B videos watched per day, 500 hours of video uploaded per minute.
- Facebook: 2.7B users, 250B photos, 350M photos uploaded every day.
- ChatGPT: 190M users per day, more than 2.5 billion messages per day globally.

These are figures quoted by the slide.

## Slide 12: Internet Statistics

### Extracted source text

```text
Internet Statistics
• Browser Market Share Worldwide
Chrome 67%
Safari 18%
Edge 5%
Firefox 3%
• Search Engine Market Share Worldwide
Google 90%
bing 4%
Yandex 2%
Yahoo! 1%
statcounter.com
```

## Slide 13: AI Chatbot Market Share Worldwide

### Extracted source text

```text
13
```

### Visual transcription and conversion notes

Image-only chart transcription: AI Chatbot Market Share Worldwide, July 2024 to July 2025. Source shown: statcounter.

| Service | Share printed on chart |
| --- | --- |
| ChatGPT | 81.43% |
| Perplexity | 10.85% |
| Microsoft Copilot | 3.79% |
| Google Gemini | 2.19% |
| Deepseek | 1.06% |
| Claude | 0.68% |
| Other | 0% |

## Slide 14: Challenge 2: Network/Link Congestion

### Extracted source text

```text
Challenge 2: Network/Link Congestion
• Congestion occurs when traffic demand exceeds available capacity
• Packets accumulate in network queues
• Queueing causes increasing delays
• Severe congestion can cause packet loss
• Congestion control and traffic engineering help manage overload
```

## Slide 15: Throughput

### Extracted source text

```text
Throughput
▪ throughput: the rate in (bits/time unit) at which bits are being sent from
sender to receiver
• instantaneous: rate at a given instant of time
• average: rate over a longer period of time
p lin ip k e c t a h p a a t c c it a y n carry pilpinek t hcaapt accainty carry
R
f
b
lu
it
id
s/
a
se
t
c
rate
Rflubidit as/ts reacte
server sends bits
s c
server, with
(R bits/sec) (R bits/sec)
(fluid) into pipe s c
file of F bits
to send to client
```

### Visual transcription and conversion notes

The pipe diagram shows a server sending bits as fluid through two consecutive links. The first carries at rate R_s bits/sec, the second at R_c bits/sec, then the bits reach the client. The extraction mixes overlapping diagram labels. Throughput means bits per unit time, instantaneous at a given time or average over a longer period.

## Slide 16: Throughput: network scenario

### Extracted source text

```text
Throughput: network scenario
▪ per-connection end-to-end
throughput: min(R ,R ,R/10)
R
s c s
R
R
s
s
▪ in practice: R or R is often
c s
bottleneck
R
R
c R
c
R
c
Several connections share the
backbone bottleneck link R bits/sec
```

### Visual transcription and conversion notes

Formula transcription: per-connection end-to-end throughput = min(R_c, R_s, R/10). Several connections share backbone capacity R. The slide uses 10 connections for the shared-link term. In practice R_c or R_s is often the bottleneck.

## Slide 17: Challenge 3: Network Delay

### Extracted source text

```text
Challenge 3: Network Delay
• Propagation delay depends on physical distance
• Transmission delay depends on packet size and link capacity
• Processing delay occurs inside network devices
• Queueing delay increases during congestion
• Low latency is critical for real-time applications
```

## Slide 18: Packet delay: four sources

### Extracted source text

```text
Packet delay: four sources
transmission
A
propagation
B
nodal
processing queueing
d = d + d + d + d
nodal proc queue trans prop
d : queueing delay
d : nodal processing
queue
proc
▪ time waiting at output link for
▪ check bit errors
transmission
▪ determine output link
▪ depends on the congestion level of
▪ typically in micro seconds
router
```

### Visual transcription and conversion notes

Formula transcription: d_nodal = d_proc + d_queue + d_trans + d_prop.
- Processing: check bit errors and determine the output link, typically microseconds.
- Queueing: wait at the output link for transmission. This depends on router congestion.
- Diagram: packets from A and B reach a router, pass through processing and queueing, then transmission onto the link and propagation toward the next router.

## Slide 19: Packet delay: four sources

### Extracted source text

```text
Packet delay: four sources
transmission
A
propagation
B
nodal
processing queueing
d = d + d + d + d
nodal proc queue trans prop
d : transmission delay: d : propagation delay:
trans prop
▪ L: packet length (bits) ▪ d: length of physical link
▪ R: link transmission rate (bps) ▪ s: link propagation speed (~2x108 m/sec)
▪ d = L/R ▪ d = d/s
trans prop
d and d
trans prop
are different
```

### Visual transcription and conversion notes

Formula transcription:
- d_trans = L / R, where L is packet length in bits and R is link transmission rate in bits per second.
- d_prop = d / s, where d is physical link length and s is propagation speed, approximately 2 × 10^8 m/s.
- d_nodal = d_proc + d_queue + d_trans + d_prop.

Transmission delay and propagation delay are different.

## Slide 20: Challenge 4: Packet Loss

### Extracted source text

```text
Challenge 4: Packet Loss
• Packets may be dropped because of congestion
• Network errors can also cause packet loss
• Lost packets may require retransmission
• Retransmissions consume additional network resources
• High packet loss can significantly degrade application performance
```

## Slide 21: Challenge 5: Scalability

### Extracted source text

```text
Challenge 5: Scalability
• Internet applications must support rapidly changing demand
• More users require additional computing resources
• Horizontal scaling adds additional server instances
• Load balancing distributes workloads across servers
• Autoscaling helps respond dynamically to traffic changes
```

## Slide 22: Challenge 6: Security

### Extracted source text

```text
Challenge 6: Security
• DDoS attacks can overwhelm networks and servers
• Malware and botnets generate malicious traffic
• Unauthorized access threatens applications and data
• Encryption protects information during communication
• Continuous monitoring and Zero Trust improve security
```

## Slide 23: Challenge 7: Reliability & Availability

### Extracted source text

```text
Challenge 7: Reliability & Availability
• Hardware and software failures can interrupt services
• Network links and data centers can experience outages
• Redundant servers improve service availability
• Load balancing can redirect traffic from failed systems
• Disaster recovery is essential for critical services
```

## Slide 24: Challenge 9: Energy & Sustainability

### Extracted source text

```text
Challenge 9: Energy & Sustainability
• Data centers consume substantial amounts of electricity
• AI workloads increase computing and cooling requirements
• Network infrastructure also consumes significant energy
• Efficient hardware and workload management can reduce consumption
• Sustainable infrastructure is becoming an important design objective
```

## Slide 25: AI-Driven Networks and Servers

### Extracted source text

```text
AI-Driven Networks and Servers
• AI can dynamically optimize traffic routing
• Intelligent load balancing can distribute workloads
• AI can predict resource requirements and traffic peaks
• AI can detect security threats and anomalies
• AI agents can assist with monitoring and automated remediation
```
