import type { Question } from '../types.ts';
import { CENG401_COURSE_ID } from './ceng401.ts';

/**
 * The CENG 401 question bank.
 *
 * ── What is examined, and what is deliberately not ────────────────────────
 *
 * The lectures quote a lot of statistics: user counts, browser share, chatbot
 * market share. None of them is examined here. They are figures the slides
 * attribute to statista and statcounter, they date within months, and a
 * question that rewards memorising "Chrome 67%" teaches nothing about network
 * servers. The same goes for Napster's founding year.
 *
 * What is examined is the reasoning the course is built on: which term limits
 * a distribution time and why, how the four delays differ, which socket call
 * comes next and what it returns, which peer a key lands on. Those have
 * defensible answers that come from the slides, and they are what a quiz on
 * this material can actually ask.
 *
 * ── Numbers carry units, and the working is in the explanation ────────────
 *
 * Every calculated answer states its units and shows the substitution, because
 * a student who gets 388.89 by the wrong route has learned nothing and will
 * not notice. The explanation is where the wrong route gets named: the
 * distractors are the specific mistakes these formulas invite, such as using
 * F/u_s where N*F/u_s belongs, or taking the largest download rate as d_min.
 *
 * ── Marks ─────────────────────────────────────────────────────────────────
 *
 * 1 for a flashcard, 2 for recall, 3 for reasoning, 4 to 6 for multi-part and
 * written work, matching the two sample courses so a mixed rehearsal's total
 * means the same thing across courses.
 */
export const CENG401_QUESTIONS: Question[] = [
  /* ── Servers, client-server, cloud and edge ───────────────────────────── */
  {
    id: 'q-ceng-srv-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-servers',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Network server',
    answer:
      'A system that provides resources or services to other devices over a network: it receives client requests, processes them, and returns responses, and one server can serve many clients at once.',
    explanation:
      'The lecture defines servers by what they do for clients rather than by any particular hardware, which is why the same definition covers web, DNS, database, email, application and file servers.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-intro' },
  },
  {
    id: 'q-ceng-srv-fc-2',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-servers',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Edge computing',
    answer:
      'Moving processing closer to users and connected devices, which lowers latency through shorter paths and reduces the raw data sent to the cloud, at the cost of more management and security work across distributed infrastructure.',
    explanation:
      'Both halves are needed. Edge computing is a trade, not a free improvement, and the lecture lists the new challenges on the same slide as the benefits.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-cloud-edge' },
  },
  {
    id: 'q-ceng-srv-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-servers',
    difficulty: 'recall',
    marks: 2,
    prompt:
      'According to Lecture 1, which service converts human-readable domain names into IP addresses?',
    options: [
      'A DNS server',
      'A load balancer',
      'A CDN edge node',
      'A database server',
    ],
    correctIndices: [0],
    explanation:
      'DNS does the name-to-address conversion. A load balancer distributes requests across servers, and a CDN serves content from a geographically closer location. Both appear in the same traffic path, which is why they are easy to confuse with the lookup step.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-intro' },
  },
  {
    id: 'q-ceng-srv-ord-1',
    courseId: CENG401_COURSE_ID,
    format: 'ordering',
    topicId: 'ceng-servers',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Put the stages of how Internet traffic reaches a server into the order Lecture 1, slide 8 gives them.',
    sequence: [
      'DNS converts the domain name into an IP address.',
      'Packets are forwarded through multiple routers.',
      'Routing determines paths across interconnected networks.',
      'A CDN can serve the content from a geographically closer location.',
      'A load balancer distributes the request across multiple servers.',
    ],
    explanation:
      'The address has to exist before packets can be forwarded toward it, and the load balancer is the last hop because it sits in front of the servers themselves.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-cloud-edge' },
  },
  {
    id: 'q-ceng-srv-match-1',
    courseId: CENG401_COURSE_ID,
    format: 'matching',
    topicId: 'ceng-servers',
    difficulty: 'recall',
    marks: 4,
    prompt: 'Match each server type to what Lecture 1 says it delivers.',
    pairs: [
      { left: 'Web server', right: 'Web pages, files and web-based content' },
      { left: 'Database server', right: 'Storage, retrieval and management of structured information' },
      { left: 'DNS server', right: 'Conversion of domain names into IP addresses' },
      { left: 'File/storage server', right: 'Centralized access to files and digital storage' },
    ],
    explanation:
      'These four are the types slide 5 names. The distinction that matters later is that only the DNS server is consulted before the connection to the others is made.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-intro' },
  },
  {
    id: 'q-ceng-srv-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-servers',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Select every property Lecture 1 attributes to cloud-based server architecture.',
    options: [
      'Computing and storage can be provisioned on demand',
      'Resources can increase or decrease according to application demand',
      'Providers operate large numbers of interconnected data centers',
      'Processing is moved closer to users and connected devices',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The fourth is edge computing, from the next slide. Cloud centralizes capacity and makes it elastic. Edge pushes it outward to shorten the path. Reading the last option as a cloud property is the usual slip.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-cloud-edge' },
  },

  /* ── Throughput, bottlenecks and delay ────────────────────────────────── */
  {
    id: 'q-ceng-del-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-delay',
    difficulty: 'recall',
    marks: 1,
    prompt: 'The four components of nodal delay',
    answer:
      'd_nodal = d_proc + d_queue + d_trans + d_prop: processing, queueing, transmission and propagation.',
    explanation:
      'Two are described and two are calculated. Processing and queueing depend on the router and its congestion, while transmission and propagation have formulas, L/R and d/s.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
  },
  {
    id: 'q-ceng-del-fc-2',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-delay',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Transmission delay and propagation delay, as formulas',
    answer:
      'd_trans = L/R, packet length in bits over link rate in bits per second. d_prop = d/s, physical link length over propagation speed, about 2 x 10^8 m/sec.',
    explanation:
      'The slide states outright that these two are different. d_trans is about the packet and the link rate, while d_prop is about the distance and does not depend on the packet at all.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
  },
  {
    id: 'q-ceng-del-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-delay',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'A 12,000-bit packet is sent on a 6 Mbps link that is 3,000 km long, with propagation speed 2 x 10^8 m/sec. What are the transmission and propagation delays?',
    options: [
      'd_trans = 2 ms, d_prop = 15 ms',
      'd_trans = 15 ms, d_prop = 2 ms',
      'd_trans = 2 ms, d_prop = 1.5 ms',
      'd_trans = 2 s, d_prop = 15 s',
    ],
    correctIndices: [0],
    explanation:
      'd_trans = L/R = 12,000 bits / 6,000,000 bits per second = 0.002 s = 2 ms. d_prop = d/s = 3,000,000 m / (2 x 10^8 m/sec) = 0.015 s = 15 ms. The second option swaps them, which is the mistake to watch for: here propagation dominates, but on a slow link with a large packet transmission can dominate instead.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
  },
  {
    id: 'q-ceng-del-mc-2',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-delay',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Ten connections share a backbone link of R = 80 Mbps. One of them has server access rate R_s = 25 Mbps and client access rate R_c = 10 Mbps. What is its end-to-end throughput?',
    options: [
      '8 Mbps, because the fair share of the backbone is the smallest of the three',
      '10 Mbps, because the client access link is the bottleneck',
      '25 Mbps, because the server can push that much',
      '80 Mbps, because the backbone has that capacity',
    ],
    correctIndices: [0],
    explanation:
      'Throughput is min(R_c, R_s, R/10) = min(10, 25, 8) = 8 Mbps. Here the shared backbone binds, because 80/10 = 8 falls below both access rates. The lecture notes that in practice R_c or R_s is usually the bottleneck instead, which makes this the case worth recognising rather than assuming.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-throughput' },
  },
  {
    id: 'q-ceng-del-mc-3',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-delay',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Ten connections share a backbone of R = 300 Mbps. One has R_s = 40 Mbps and R_c = 18 Mbps. Which term limits its throughput?',
    options: [
      'R_c, giving 18 Mbps',
      'R/10, giving 30 Mbps',
      'R_s, giving 40 Mbps',
      'R, giving 300 Mbps',
    ],
    correctIndices: [0],
    explanation:
      'min(18, 40, 30) = 18 Mbps, so the client access link binds. Compare this with the congested case: the same formula gives a different limiting term purely because the backbone here is generous enough that a tenth of it still exceeds the access rates.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-throughput' },
  },
  {
    id: 'q-ceng-del-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-delay',
    difficulty: 'stretch',
    marks: 4,
    prompt:
      'Select every statement about the four delay components that follows from Lecture 1, slides 18 and 19.',
    options: [
      'Queueing delay depends on the congestion level of the router',
      'Processing delay covers checking bit errors and determining the output link',
      'Doubling the packet length doubles the transmission delay on the same link',
      'Doubling the packet length doubles the propagation delay on the same link',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The fourth is false and is the central confusion the slides warn about. d_prop = d/s contains no L term at all: propagation is how long a bit takes to cross the distance, and a longer packet does not make the wire longer.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
  },
  {
    id: 'q-ceng-del-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-delay',
    difficulty: 'recall',
    marks: 3,
    prompt: 'Complete the delay formulas from Lecture 1, slide 19.',
    template:
      'Transmission delay is d_trans = L / ___, where L is the packet length in bits. Propagation delay is d_prop = d / ___, where d is the length of the physical link. The four components sum as d_nodal = d_proc + ___ + d_trans + d_prop.',
    blanks: [['r'], ['s'], ['d_queue', 'dqueue', 'queueing delay', 'queuing delay', 'd queue']],
    explanation:
      'R is the link transmission rate and s the propagation speed. Writing d_trans = L/s is the classic slip, and it makes transmission delay independent of the link rate, which is nonsense.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
  },
  {
    id: 'q-ceng-del-match-1',
    courseId: CENG401_COURSE_ID,
    format: 'matching',
    topicId: 'ceng-delay',
    difficulty: 'reasoning',
    marks: 4,
    prompt: 'Match each delay component to what it depends on.',
    pairs: [
      { left: 'Processing delay', right: 'Error checking and output-link lookup inside the device, typically microseconds' },
      { left: 'Queueing delay', right: 'How congested the router is when the packet arrives' },
      { left: 'Transmission delay', right: 'Packet length and link transmission rate' },
      { left: 'Propagation delay', right: 'Physical link length and propagation speed' },
    ],
    explanation:
      'Only the last two have formulas in the lecture. The first two vary with the device and the traffic, which is why they are described rather than computed.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
  },
  {
    id: 'q-ceng-del-written-1',
    courseId: CENG401_COURSE_ID,
    format: 'written-recall',
    topicId: 'ceng-delay',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'A classmate says transmission delay and propagation delay are "basically the same thing, just measured differently". Explain the difference, give both formulas, and describe one situation where each one dominates.',
    answer:
      'Transmission delay, L/R, is the time to push all the packet bits onto the link and depends on packet size and link rate. Propagation delay, d/s, is the time for a bit to travel the physical distance and depends on link length and propagation speed.',
    rubric: [
      {
        id: 'r-ceng-del-1',
        label: 'Gives d_trans = L/R and identifies L and R',
        marks: 2,
        keywords: ['l/r', 'l / r', 'packet length', 'transmission rate', 'link rate'],
        missedAdvice:
          'State the formula explicitly: d_trans = L/R, packet length in bits over link transmission rate in bits per second.',
      },
      {
        id: 'r-ceng-del-2',
        label: 'Gives d_prop = d/s and identifies d and s',
        marks: 2,
        keywords: ['d/s', 'd / s', 'propagation speed', 'physical link', 'distance'],
        missedAdvice:
          'State the formula explicitly: d_prop = d/s, link length over propagation speed, roughly 2 x 10^8 m/sec.',
      },
      {
        id: 'r-ceng-del-3',
        label: 'Says the two depend on different quantities, so neither implies the other',
        marks: 1,
        keywords: ['independent', 'different', 'does not depend', 'no l', 'unrelated', 'not affected'],
        missedAdvice:
          'The key point is that d_prop contains no packet-length term, so changing the packet size moves one delay and not the other.',
      },
      {
        id: 'r-ceng-del-4',
        label: 'Gives a case where each dominates',
        marks: 1,
        keywords: ['long distance', 'satellite', 'intercontinental', 'slow link', 'large packet', 'dominate', 'short link'],
        missedAdvice:
          'A long intercontinental or satellite path makes propagation dominate. A large packet on a slow access link makes transmission dominate.',
      },
    ],
    explanation:
      'Keeping these apart is what makes the rest of the delay material usable. A student who merges them cannot explain why a fast link across an ocean still feels slow.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
  },
  {
    id: 'q-ceng-del-src-1',
    courseId: CENG401_COURSE_ID,
    format: 'source-analysis',
    topicId: 'ceng-delay',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'Using this extract, explain what the third term contributes and when it decides the throughput. Name the quantities involved.',
    extract:
      'Slide 16 puts that in a network. The per-connection end-to-end throughput is min(R_c, R_s, R/10), where R is the capacity of a backbone link shared by ten connections. In practice R_c or R_s is often the bottleneck.',
    answer:
      'R/10 is one connection\'s share of a backbone shared by ten connections. It decides the throughput only when that share falls below both the client and server access rates.',
    rubric: [
      {
        id: 'r-ceng-thr-1',
        label: 'Explains that R/10 is a per-connection share of the shared backbone',
        marks: 2,
        keywords: ['share', 'shared', 'ten connections', '10 connections', 'divided', 'each connection'],
        missedAdvice:
          'The 10 is the number of connections sharing the link, so R/10 is what one connection gets if the link is divided evenly.',
      },
      {
        id: 'r-ceng-thr-2',
        label: 'States the minimum rule: the smallest of the three sets the throughput',
        marks: 2,
        keywords: ['minimum', 'min(', 'smallest', 'lowest', 'bottleneck'],
        missedAdvice:
          'Throughput is the minimum of the three rates, so the smallest one is the bottleneck by definition.',
      },
      {
        id: 'r-ceng-thr-3',
        label: 'Says the backbone term binds only when R/10 is below both access rates',
        marks: 2,
        keywords: ['below both', 'less than', 'smaller than r_c', 'smaller than r_s', 'only when', 'congested'],
        missedAdvice:
          'It matters when R/10 < R_c and R/10 < R_s. The lecture adds that in practice the access links are usually the bottleneck instead.',
      },
    ],
    explanation:
      'The point of the third term is that a connection can be limited by traffic that is not its own. Identifying which of the three binds is what these questions actually test.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-throughput' },
  },

  /* ── Scaling, security, availability, energy, AI ──────────────────────── */
  {
    id: 'q-ceng-scl-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-scaling',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Horizontal scaling',
    answer:
      'Adding additional server instances to meet demand, with load balancing to distribute workloads across them and autoscaling to respond dynamically to traffic changes.',
    explanation:
      'The lecture pairs scaling with load balancing on purpose: extra instances do nothing unless requests are spread across them.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-challenges' },
  },
  {
    id: 'q-ceng-scl-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-scaling',
    difficulty: 'reasoning',
    marks: 2,
    prompt:
      'Lecture 1 lists load balancing under two different challenges. Which pair?',
    options: [
      'Scalability, and reliability and availability',
      'Security, and energy and sustainability',
      'Traffic load, and packet loss',
      'Network delay, and congestion',
    ],
    correctIndices: [0],
    explanation:
      'Under scalability it distributes workloads across servers. Under reliability and availability it redirects traffic away from failed systems. Same mechanism, two different reasons to want it.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-challenges' },
  },
  {
    id: 'q-ceng-scl-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-scaling',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Select every use of AI in networks and servers that Lecture 1, slide 25 names.',
    options: [
      'Dynamically optimizing traffic routing',
      'Predicting resource requirements and traffic peaks',
      'Detecting security threats and anomalies',
      'Replacing the transport layer protocol stack',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The slide also names intelligent load balancing and AI agents assisting with monitoring and automated remediation. Nothing in the lecture suggests AI replaces the protocol stack, and the energy slide notes AI workloads increase demand rather than only reducing it.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-challenges' },
  },
  {
    id: 'q-ceng-scl-match-1',
    courseId: CENG401_COURSE_ID,
    format: 'matching',
    topicId: 'ceng-scaling',
    difficulty: 'recall',
    marks: 4,
    prompt:
      'Match each Lecture 1 challenge to a measure the slides give for it.',
    pairs: [
      { left: 'Congestion', right: 'Congestion control and traffic engineering' },
      { left: 'Security', right: 'Encryption, continuous monitoring and Zero Trust' },
      { left: 'Reliability and availability', right: 'Redundant servers and disaster recovery' },
      { left: 'Energy and sustainability', right: 'Efficient hardware and workload management' },
    ],
    explanation:
      'Each challenge slide ends with what is done about it, and the pairing is the quickest way to check whether the list has actually been learned rather than skimmed.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-challenges' },
  },
  {
    id: 'q-ceng-scl-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-scaling',
    difficulty: 'recall',
    marks: 2,
    prompt: 'Complete the sentence from the packet-loss and congestion slides.',
    template:
      'Congestion occurs when traffic demand exceeds available ___. Packets accumulate in network queues, queueing causes increasing delays, and severe congestion can cause packet ___.',
    blanks: [['capacity', 'bandwidth'], ['loss', 'drops', 'drop']],
    explanation:
      'The chain runs demand over capacity, then queue growth, then delay, then loss. Loss is the end of that chain rather than a separate phenomenon.',
    source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-throughput' },
  },

  /* ── UDP versus TCP, headers, demultiplexing ──────────────────────────── */
  {
    id: 'q-ceng-tra-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-transport',
    difficulty: 'recall',
    marks: 1,
    prompt: 'The four fields of the UDP header, and its size',
    answer:
      'Source port, destination port, length and checksum. Eight bytes in total, excluding the application data.',
    explanation:
      'Eight bytes is the number to remember, and the four fields are why: two 32-bit rows, two fields each.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp' },
  },
  {
    id: 'q-ceng-tra-fc-2',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-transport',
    difficulty: 'recall',
    marks: 1,
    prompt: 'What identifies a UDP socket, and what identifies a TCP socket?',
    answer:
      'A UDP socket is identified by destination IP address and destination port. A TCP socket is identified by four values: source IP, source port, destination IP and destination port.',
    explanation:
      'This single difference explains both demultiplexing slides. Two clients reach one UDP socket, and two clients reach two different TCP sockets even on the same server port.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp' },
  },
  {
    id: 'q-ceng-tra-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-transport',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Three TCP segments arrive at server B, all with destination port 80. Their source endpoints are A:9157, C:5775 and C:9157. How many sockets do they reach?',
    options: [
      'Three, because a TCP socket is identified by all four of source IP, source port, destination IP and destination port',
      'One, because they share a destination port',
      'Two, because the two segments with source port 9157 share a socket',
      'Two, because the two segments from host C share a socket',
    ],
    correctIndices: [0],
    explanation:
      'All four values are part of the identity, so all three differ. Option three would be right for UDP-style demultiplexing on port alone, and option four collapses two connections from one host, which is exactly what a browser opening several connections would break.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp' },
  },
  {
    id: 'q-ceng-tra-mc-2',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-transport',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'In the Lecture 2, slide 6 example, the UDP server is on port 6428 and a client is on port 5775. What are the source and destination ports of the server\'s reply to that client?',
    options: [
      'Source 6428, destination 5775',
      'Source 5775, destination 6428',
      'Source 6428, destination 6428',
      'Source 5775, destination 5775',
    ],
    correctIndices: [0],
    explanation:
      'The reply reverses the pair: the server sends from its own port to the client\'s port. The slide leaves this case as question marks and fills in the matching pair, 9157, for the other client.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp' },
  },
  {
    id: 'q-ceng-tra-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-transport',
    difficulty: 'reasoning',
    marks: 4,
    prompt: 'Select every service Lecture 2 attributes to TCP but not to UDP.',
    options: [
      'Reliable, in-order delivery using sequence numbers',
      'Flow control to prevent receiver buffer overflow',
      'Congestion control adapting to network congestion',
      'Error detection using a checksum',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'Both protocols carry a checksum, so error detection is not the distinguishing feature. What TCP adds is what it does after detection: acknowledgments, retransmission, ordering, and the two control loops.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp' },
  },
  {
    id: 'q-ceng-tra-ms-2',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-transport',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Select every reason Lecture 2 gives for an application choosing UDP.',
    options: [
      'Retransmitting is not worthwhile when small data loss is acceptable, as in VoIP or IPTV',
      'Connection establishment overhead can be overwhelming for simple query-response exchanges such as DNS',
      'The header is only eight bytes, so overhead per datagram is small',
      'Byte-level sequence numbers let the receiver reassemble a stream in order',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The last is TCP: each byte, not each packet, gets a sequence number. The first three are the lecture\'s three reasons, and they are about avoiding cost rather than gaining capability.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp' },
  },
  {
    id: 'q-ceng-tra-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-transport',
    difficulty: 'recall',
    marks: 3,
    prompt: 'Complete the demultiplexing rule.',
    template:
      'A UDP socket is identified by the destination IP address and the destination ___ number. A TCP socket is identified by ___ values, which is why two connections from the same host to the same server port reach different sockets. TCP is a stream-of-___ service, in which each one is given a sequence number.',
    blanks: [
      ['port'],
      ['four', '4'],
      ['bytes', 'byte'],
    ],
    explanation:
      'The four values are source IP, source port, destination IP and destination port. The stream-of-bytes point is separate but often confused with it: sequence numbers count bytes, not packets.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp' },
  },
  {
    id: 'q-ceng-tra-match-1',
    courseId: CENG401_COURSE_ID,
    format: 'matching',
    topicId: 'ceng-transport',
    difficulty: 'recall',
    marks: 4,
    prompt:
      'Match each application to the underlying transport protocol Lecture 2, slide 11 lists for it.',
    pairs: [
      { left: 'Web (HTTP)', right: 'TCP' },
      { left: 'File transfer (FTP)', right: 'TCP' },
      { left: 'Name translation (DNS)', right: 'Typically UDP' },
      { left: 'Network management (SNMP)', right: 'Typically UDP' },
    ],
    explanation:
      'This is the lecture table, and the word "typically" is part of it. Slide 12 immediately discusses QUIC and HTTP/3, which put web traffic over UDP, so the table describes the common case rather than a rule.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp' },
  },
  {
    id: 'q-ceng-tra-written-1',
    courseId: CENG401_COURSE_ID,
    format: 'written-recall',
    topicId: 'ceng-transport',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'Explain why a UDP server can serve two clients through one socket while a TCP server ends up with a separate socket per client. Refer to what identifies each kind of socket.',
    answer:
      'A UDP socket is identified by destination IP and port only, so datagrams from any source arrive at the same socket and recvfrom returns the sender address. A TCP socket is identified by the four-tuple, so each distinct source endpoint is a distinct socket, created by accept().',
    rubric: [
      {
        id: 'r-ceng-tra-1',
        label: 'States the UDP identity: destination IP and destination port',
        marks: 2,
        keywords: ['destination port', 'destination ip', 'two values', 'port only', 'dest port'],
        missedAdvice:
          'Name it explicitly: a UDP socket is identified by the destination IP address and destination port number, and nothing about the sender.',
      },
      {
        id: 'r-ceng-tra-2',
        label: 'States the TCP identity: the four-tuple',
        marks: 2,
        keywords: ['four', '4-tuple', 'four-tuple', 'source ip', 'source port', 'quadruple'],
        missedAdvice:
          'A TCP socket is identified by source IP, source port, destination IP and destination port, so changing any one of them makes a different socket.',
      },
      {
        id: 'r-ceng-tra-3',
        label: 'Connects this to recvfrom returning the client address, or to accept returning a new socket',
        marks: 2,
        keywords: ['recvfrom', 'accept', 'client address', 'connection socket', 'connectionsocket', 'new socket'],
        missedAdvice:
          'The API shows the consequence: UDP recvfrom hands back the sender address because the socket does not know it, while TCP accept returns a new socket that already does.',
      },
    ],
    explanation:
      'The demultiplexing rule and the socket API are the same fact seen from two sides, and questions on this topic usually approach it from whichever side the student revised less.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp' },
  },

  /* ── QUIC, HTTP/3, MQTT ───────────────────────────────────────────────── */
  {
    id: 'q-ceng-qui-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-quic',
    difficulty: 'recall',
    marks: 1,
    prompt: 'QUIC',
    answer:
      'A modern transport that runs over UDP while providing reliable, multiplexed streams, flow control, low-latency connection establishment, integrated TLS, and connection migration. HTTP/3 uses it.',
    explanation:
      'Running over UDP does not make QUIC unreliable. It builds reliability above UDP rather than inheriting TCP\'s, which is what buys the lower connection-setup latency.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-quic' },
  },
  {
    id: 'q-ceng-qui-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-quic',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'A student writes: "HTTP/3 runs over QUIC, which runs over UDP, so HTTP/3 cannot deliver data reliably." What is wrong with this?',
    options: [
      'QUIC provides reliable delivery itself, so reliability comes from QUIC rather than from the layer below it',
      'Nothing: HTTP/3 is best-effort only',
      'HTTP/3 actually runs over TCP, so the premise is wrong',
      'UDP provides reliable delivery, so the conclusion does not follow',
    ],
    correctIndices: [0],
    explanation:
      'The premise is right and the inference is wrong. Reliability is a property a protocol can add above an unreliable one, which is precisely the design QUIC chose in order to avoid TCP\'s setup cost.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-quic' },
  },
  {
    id: 'q-ceng-qui-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-quic',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Select every property Lecture 2 gives for the MQTT publish-subscribe model in IoT networks.',
    options: [
      'A broker node sits between IoT sensors and the end-server',
      'Sensors need not know the recipient, and vice versa',
      'Sensors and recipients need not be online at the same time',
      'MQTT runs over UDP to avoid connection setup',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'MQTT uses TCP, which the slide states directly. The decoupling comes from the broker, not from the transport, and that is the distinction the last option is designed to catch.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-quic' },
  },
  {
    id: 'q-ceng-qui-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-quic',
    difficulty: 'recall',
    marks: 2,
    prompt: 'Complete the statements about QUIC and MQTT.',
    template:
      'QUIC runs over ___ and is used by HTTP/3, integrating TLS and reducing connection-establishment latency. MQTT, preferred by IoT over request-response protocols, runs over ___ and places a broker between sensors and the end-server.',
    blanks: [['udp'], ['tcp']],
    explanation:
      'These two are worth learning as a pair precisely because they cross over: the low-latency web transport chose UDP, and the lightweight IoT protocol chose TCP.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-quic' },
  },

  /* ── Socket APIs and interaction order ────────────────────────────────── */
  {
    id: 'q-ceng-sok-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-sockets',
    difficulty: 'recall',
    marks: 1,
    prompt: 'socket(AF_INET, SOCK_DGRAM) versus socket(AF_INET, SOCK_STREAM)',
    answer:
      'AF_INET means the underlying network is IPv4 in both. SOCK_DGRAM creates a UDP socket, SOCK_STREAM creates a TCP socket.',
    explanation:
      'The first parameter is the address family and does not change between the two examples. Only the second selects the transport protocol.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp-code' },
  },
  {
    id: 'q-ceng-sok-fc-2',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-sockets',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Welcoming socket against connection socket, in the TCP server',
    answer:
      'serverSocket is the welcoming socket: it binds port 12000, listens, and stays open for the next client. accept() returns connectionSocket, a second socket that carries one client\'s conversation and is closed when that conversation ends.',
    explanation:
      'Closing the welcoming socket instead of the connection socket is the classic bug. The server would serve one client and then refuse every other.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
  },
  {
    id: 'q-ceng-sok-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-sockets',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'In UDPServer.py, what does `message, clientAddress = serverSocket.recvfrom(2048)` return, and why does the server need it?',
    options: [
      'The datagram and the sender\'s IP and port, which sendto needs because the socket holds no connection to reply through',
      'The datagram and the server\'s own address, which is used for logging only',
      'The datagram and the number of bytes received, so the buffer can be resized',
      'The datagram only, because 2048 is the buffer size and nothing else is returned',
    ],
    correctIndices: [0],
    explanation:
      '2048 is the buffer size passed in, not something returned. The client address is what the following sendto uses, and this is exactly what TCP does not need because connect and accept already fixed both ends.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp-code' },
  },
  {
    id: 'q-ceng-sok-mc-2',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-sockets',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Why does the TCP client call `clientSocket.send(sentence.encode(\'ascii\'))` without naming the server, while the UDP client passes (serverName, serverPort) to every sendto?',
    options: [
      'connect() established the connection, so the socket already knows both endpoints',
      'The TCP server broadcasts, so no address is needed',
      'TCP reads the destination from the bind call on the client',
      'The UDP client is simply written less efficiently, and could omit the address too',
    ],
    correctIndices: [0],
    explanation:
      'This is the clearest behavioural difference between the two clients. The UDP socket is connectionless, so nothing has recorded a destination, and each datagram has to carry one.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
  },
  {
    id: 'q-ceng-sok-ord-1',
    courseId: CENG401_COURSE_ID,
    format: 'ordering',
    topicId: 'ceng-sockets',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Put the TCP client-server interaction into the order Lecture 2, slide 23 gives it.',
    sequence: [
      'The server creates a welcoming socket on port x and waits for a connection request.',
      'The client creates a socket and connects to that host and port.',
      'Connection setup completes and the server\'s accept() returns a new connection socket.',
      'The client sends its request, and the server reads it from the connection socket.',
      'The server writes the reply to the connection socket, and the client reads it.',
      'The connection socket and the client socket close.',
    ],
    explanation:
      'The server has to be listening before the client can connect, and accept() cannot return until the connection exists. Those two constraints fix the whole order.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
  },
  {
    id: 'q-ceng-sok-ord-2',
    courseId: CENG401_COURSE_ID,
    format: 'ordering',
    topicId: 'ceng-sockets',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Put the UDP client-server interaction into the order Lecture 2, slide 16 gives it.',
    sequence: [
      'The server creates a socket and binds it to port x.',
      'The client creates a socket.',
      'The client creates a datagram carrying the server IP and port x, and sends it.',
      'The server reads the datagram, obtaining the client\'s address and port.',
      'The server writes a reply addressed to that client address and port.',
      'The client reads the reply and closes its socket.',
    ],
    explanation:
      'There is no connection setup step here, which is the whole difference from the TCP sequence. The server learns the client\'s address from the datagram it receives rather than from an accept.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp-code' },
  },
  {
    id: 'q-ceng-sok-match-1',
    courseId: CENG401_COURSE_ID,
    format: 'matching',
    topicId: 'ceng-sockets',
    difficulty: 'recall',
    marks: 5,
    prompt: 'Match each socket call to what it does in the lecture examples.',
    pairs: [
      { left: 'bind', right: 'Assigns a local port number to the server socket' },
      { left: 'listen', right: 'Puts the TCP welcoming socket into a state where it accepts incoming requests' },
      { left: 'accept', right: 'Waits for a connection and returns a new socket for that client' },
      { left: 'recvfrom', right: 'Reads a UDP datagram and returns the sender address with it' },
      { left: 'connect', right: 'Establishes the TCP connection to a named server and port' },
    ],
    explanation:
      'bind is the only one both servers use. listen and accept are TCP only, recvfrom is UDP only, and connect is called by the TCP client rather than by either server.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
  },
  {
    id: 'q-ceng-sok-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-sockets',
    difficulty: 'stretch',
    marks: 4,
    prompt:
      'Select every statement that is true of the TCP server code in Lecture 2, slide 24.',
    options: [
      'serverSocket is created with SOCK_STREAM and bound to port 12000',
      'accept() is called inside the loop, so a new connection socket is made per client',
      'recv(1024) returns bytes without a separate sender address',
      'connectionSocket.close() ends the server, so only one client can ever be served',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'close() on the connection socket ends that client\'s conversation and the loop returns to accept() for the next one. The welcoming socket is never closed, which is what keeps the server available.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
  },
  {
    id: 'q-ceng-sok-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-sockets',
    difficulty: 'recall',
    marks: 3,
    prompt: 'Complete the UDP server code from Lecture 2, slide 19.',
    template:
      'serverSocket = socket(AF_INET, ___)\nserverSocket.___((\'\', serverPort))\nmessage, clientAddress = serverSocket.___(2048)',
    blanks: [
      ['sock_dgram'],
      ['bind'],
      ['recvfrom'],
    ],
    explanation:
      'SOCK_DGRAM selects UDP, bind fixes the local port at 12000, and recvfrom reads the datagram along with the client address that the following sendto needs.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp-code' },
  },
  {
    id: 'q-ceng-sok-written-1',
    courseId: CENG401_COURSE_ID,
    format: 'written-recall',
    topicId: 'ceng-sockets',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'A TCP server calls serverSocket.close() instead of connectionSocket.close() at the end of the loop. Describe what happens to the first client, to the second client, and explain which socket does what.',
    answer:
      'The first client is served normally. Closing the welcoming socket destroys the door, so the next accept() has nothing to accept and the second client cannot connect. The welcoming socket listens for new connections, and the connection socket carries one conversation.',
    rubric: [
      {
        id: 'r-ceng-sok-1',
        label: 'Says the first client is served correctly',
        marks: 1,
        keywords: ['first client', 'first connection', 'works', 'served', 'succeeds', 'completes'],
        missedAdvice:
          'The reply has already been sent by that point, so the first exchange finishes normally. The damage is to everything after it.',
      },
      {
        id: 'r-ceng-sok-2',
        label: 'Says the second client cannot connect because the welcoming socket is gone',
        marks: 2,
        keywords: ['second', 'cannot connect', 'fails', 'refused', 'no longer listening', 'next client'],
        missedAdvice:
          'With the welcoming socket closed there is nothing listening on port 12000, so the next accept() has no door to accept through.',
      },
      {
        id: 'r-ceng-sok-3',
        label: 'Identifies the welcoming socket as the one that listens and accepts',
        marks: 2,
        keywords: ['welcoming', 'listen', 'accept', 'door', 'serversocket'],
        missedAdvice:
          'serverSocket is the welcoming socket: it binds, listens, and produces a new socket on every accept.',
      },
      {
        id: 'r-ceng-sok-4',
        label: 'Identifies the connection socket as per-client and the correct one to close',
        marks: 1,
        keywords: ['connectionsocket', 'connection socket', 'per client', 'one client', 'that client'],
        missedAdvice:
          'connectionSocket handles exactly one client and is the socket that should be closed when that exchange ends.',
      },
    ],
    explanation:
      'Two sockets with similar names doing different jobs is the part of the TCP example that gets mixed up under exam pressure, and tracing the failure is the fastest way to fix it for good.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
  },
  {
    id: 'q-ceng-sok-src-1',
    courseId: CENG401_COURSE_ID,
    format: 'source-analysis',
    topicId: 'ceng-sockets',
    difficulty: 'stretch',
    marks: 5,
    prompt:
      'Trace this code. Say what each of the three highlighted calls contributes, and name one thing the UDP client does that this client does not have to.',
    extract: `from socket import *
serverName = 'hostname'
serverPort = 12000
clientSocket = socket(AF_INET, SOCK_STREAM)
clientSocket.connect((serverName, serverPort))
sentence = input('Input lowercase sentence:')
clientSocket.send(sentence.encode('ascii'))
modifiedSentence = clientSocket.recv(1024)
print('From Server:', modifiedSentence.decode('ascii'))
clientSocket.close()`,
    answer:
      'socket(AF_INET, SOCK_STREAM) creates a TCP socket over IPv4, connect establishes the connection to the named server and port, and send transmits the encoded bytes over it. The UDP client must attach the server address to every sendto, and this one does not.',
    rubric: [
      {
        id: 'r-ceng-src-1',
        label: 'Identifies SOCK_STREAM as selecting TCP, with AF_INET as IPv4',
        marks: 1,
        keywords: ['sock_stream', 'tcp socket', 'af_inet', 'ipv4'],
        missedAdvice:
          'SOCK_STREAM is what makes this a TCP socket. AF_INET is the IPv4 address family and is the same in the UDP example.',
      },
      {
        id: 'r-ceng-src-2',
        label: 'Explains that connect establishes the connection to server and port',
        marks: 2,
        keywords: ['connect', 'establish', 'connection', 'handshake', 'sets up'],
        missedAdvice:
          'connect((serverName, serverPort)) is what establishes the TCP connection before any data is sent.',
      },
      {
        id: 'r-ceng-src-3',
        label: 'Notes that send carries no address because connect already fixed the destination',
        marks: 2,
        keywords: ['no address', 'without', 'already', 'no need to attach', 'sendto', 'destination'],
        missedAdvice:
          'That is the contrast to draw: UDP passes (serverName, serverPort) to every sendto, while TCP send needs nothing because the connection holds both endpoints.',
      },
    ],
    explanation:
      'Slide 25 annotates this exact point: "no need to attach server name, port". Tracing the code is a more reliable way to remember it than the annotation is.',
    source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
  },

  /* ── File distribution time ───────────────────────────────────────────── */
  {
    id: 'q-ceng-p2p-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-p2p-time',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Client-server file distribution time, as a bound',
    answer:
      'D_CS >= max(N*F/u_s, F/d_min). The server must send N copies at u_s, and the slowest client must download one copy at d_min.',
    explanation:
      'The N is on the server term only. Writing F/u_s instead of N*F/u_s is the single most common error on this formula, and it removes the linear growth that makes client-server scale badly.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-formulas' },
  },
  {
    id: 'q-ceng-p2p-fc-2',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-p2p-time',
    difficulty: 'recall',
    marks: 1,
    prompt: 'P2P file distribution time, as a bound',
    answer:
      'D_P2P >= max(F/u_s, F/d_min, N*F/(u_s + sum(u_i))). The server uploads at least one copy, the slowest client downloads one copy, and the peers collectively download N*F bits using the combined upload capacity.',
    explanation:
      'The third term is the interesting one: N grows the numerator, but each new peer also grows the denominator, which is why the P2P curve flattens while the client-server curve stays linear.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-formulas' },
  },
  {
    id: 'q-ceng-p2p-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-p2p-time',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Lecture 3, slide 8: F = 4 Gbits, N = 7, u_s = 72 Mbps, peer downloads 23, 14, 13, 32, 11, 30, 40 Mbps. What is the minimum client-server distribution time?',
    options: [
      '388.89 seconds',
      '363.64 seconds',
      '125 seconds',
      '55.56 seconds',
    ],
    correctIndices: [0],
    explanation:
      'max(N*F/u_s, F/d_min) = max(28000/72, 4000/11) = max(388.89 s, 363.64 s) = 388.89 seconds. The second option is the client-download term, which loses here but wins in the P2P case. The fourth is F/u_s, the single-copy time, which has no place in the client-server bound at all.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
  },
  {
    id: 'q-ceng-p2p-mc-2',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-p2p-time',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Same figures, with peer uploads 19, 24, 27, 25, 23, 21, 13 Mbps. What is the minimum P2P distribution time, and which term causes it?',
    options: [
      '363.64 seconds, set by F/d_min',
      '388.89 seconds, set by N*F/u_s',
      '125 seconds, set by the combined upload term',
      '55.56 seconds, set by F/u_s',
    ],
    correctIndices: [0],
    explanation:
      'sum(u_i) = 152, so combined upload is 72 + 152 = 224 Mbps. max(4000/72, 4000/11, 28000/224) = max(55.56, 363.64, 125) = 363.64 seconds, set by the slowest peer download of 11 Mbps. The point of the exercise is that the two models are limited by different terms: the server bottleneck is gone, and one slow peer now decides the answer.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
  },
  {
    id: 'q-ceng-p2p-mc-3',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-p2p-time',
    difficulty: 'stretch',
    marks: 3,
    prompt:
      'In the slide 8 exercise, the peer with the 11 Mbps download is upgraded to 40 Mbps and everything else is unchanged. What happens to the two bounds?',
    options: [
      'The P2P bound falls to 125 seconds, set by the combined-upload term, while the client-server bound stays at 388.89 seconds',
      'Both bounds fall to 125 seconds',
      'Neither bound changes, because d_min is not in either formula',
      'The client-server bound falls to 125 seconds and the P2P bound stays at 363.64 seconds',
    ],
    correctIndices: [0],
    explanation:
      'The new d_min is 13 Mbps, so F/d_min = 4000/13 = 307.69 s. P2P becomes max(55.56, 307.69, 125) = 307.69 s, still set by d_min rather than by the upload term. Client-server becomes max(388.89, 307.69) = 388.89 s, unchanged because the server term was already larger.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
  },
  {
    id: 'q-ceng-p2p-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-p2p-time',
    difficulty: 'stretch',
    marks: 4,
    prompt:
      'Select every statement that is true of the two distribution-time expressions as the lecture presents them.',
    options: [
      'They are lower bounds, written with >=, under idealized assumptions',
      'The client-server server term grows linearly with N',
      'In P2P, added peers raise both the numerator and the denominator of the combined-upload term',
      'Both expressions assume the network core is a bottleneck',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'Slide 4 states the opposite of the fourth: the network is assumed to have abundant bandwidth, so every constraint in these formulas sits at the edge, at a server or a peer.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-formulas' },
  },
  {
    id: 'q-ceng-p2p-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-p2p-time',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Complete the worked values for the slide 8 exercise, with F = 4 Gbits, N = 7 and u_s = 72 Mbps.',
    template:
      'The slowest peer download is d_min = ___ Mbps. The peer uploads sum to ___ Mbps, so the combined upload capacity is 224 Mbps. The client-server bound is ___ seconds.',
    blanks: [
      ['11'],
      ['152'],
      ['388.89', '388.9', '389'],
    ],
    explanation:
      'd_min is the minimum of the download rates, not the maximum and not the mean. 19 + 24 + 27 + 25 + 23 + 21 + 13 = 152, and 28000/72 = 388.89 seconds.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
  },
  {
    id: 'q-ceng-p2p-ord-1',
    courseId: CENG401_COURSE_ID,
    format: 'ordering',
    topicId: 'ceng-p2p-time',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Put the steps of computing the P2P distribution bound into a working order.',
    sequence: [
      'Identify F, N and u_s from the question.',
      'Find d_min as the smallest of the peer download rates.',
      'Sum the peer upload rates to get sum(u_i), and add u_s for the combined upload capacity.',
      'Compute the three terms: F/u_s, F/d_min and N*F/(u_s + sum(u_i)).',
      'Take the largest of the three, and name it as the limiting term.',
    ],
    explanation:
      'Naming the limiting term is part of the answer, not an extra: the exercise asks for the root cause in questions 2 and 4, and a number with no term attached does not answer it.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
  },
  {
    id: 'q-ceng-p2p-written-1',
    courseId: CENG401_COURSE_ID,
    format: 'written-recall',
    topicId: 'ceng-p2p-time',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'Using the slide 8 figures, work out both distribution times, state which term limits each, and explain why the two models are limited by different things. Show your working with units.',
    answer:
      'Client-server: max(28000/72, 4000/11) = max(388.89 s, 363.64 s) = 388.89 s, limited by the server upload term N*F/u_s. P2P: max(4000/72, 4000/11, 28000/224) = max(55.56 s, 363.64 s, 125 s) = 363.64 s, limited by F/d_min.',
    rubric: [
      {
        id: 'r-ceng-p2p-1',
        label: 'Gives the client-server time as 388.89 seconds',
        marks: 1,
        keywords: ['388.89', '388.9', '388'],
        missedAdvice:
          'N*F/u_s = 28000/72 = 388.89 seconds, which beats F/d_min = 363.64 seconds.',
      },
      {
        id: 'r-ceng-p2p-2',
        label: 'Names the server upload term as the client-server limit',
        marks: 2,
        keywords: ['server upload', 'nf/u_s', 'n*f/u_s', 'nf/us', 'server is the', 'server bottleneck'],
        missedAdvice:
          'The limiting term is N*F/u_s: the server has to send seven separate copies through a 72 Mbps uplink.',
      },
      {
        id: 'r-ceng-p2p-3',
        label: 'Gives the P2P time as 363.64 seconds',
        marks: 1,
        keywords: ['363.64', '363.6', '363'],
        missedAdvice:
          'max(55.56, 363.64, 125) = 363.64 seconds. The combined-upload term of 125 seconds is not the largest.',
      },
      {
        id: 'r-ceng-p2p-4',
        label: 'Names the slowest peer download, F/d_min, as the P2P limit',
        marks: 2,
        keywords: ['d_min', 'dmin', 'download', 'slowest', '11 mbps', 'f/d'],
        missedAdvice:
          'With peers contributing upload capacity the server term collapses to 55.56 seconds, leaving the 11 Mbps peer download as the constraint that no amount of peer help removes.',
      },
    ],
    explanation:
      'The exercise is built so the two models land on different limiting terms, and an answer that gives both numbers without naming the terms has missed what questions 2 and 4 were asking.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
  },

  /* ── Peer discovery ───────────────────────────────────────────────────── */
  {
    id: 'q-ceng-dis-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-discovery',
    difficulty: 'recall',
    marks: 1,
    prompt: 'The three approaches to locating peers',
    answer:
      'Central directory, as in Napster. Query flooding, as in Gnutella. Hierarchical overlay with super-nodes, as in Kazaa and modern Gnutella. The design goals are scalability, simplicity and robustness.',
    explanation:
      'The three sit on a line from fully centralized to fully decentralized, with Kazaa as the compromise, which is the shape worth carrying into any comparison question.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-discovery' },
  },
  {
    id: 'q-ceng-dis-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-discovery',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Lecture 3 says of Napster that "file transfer is decentralized, but locating content is highly centralized". Which limitation follows most directly?',
    options: [
      'The central directory is a single point of failure and a legal target, even though transfers put no load on the server',
      'Transfers are slow because every byte passes through the Napster server',
      'Clients cannot find each other without flooding their neighbors',
      'The directory cannot know which files are currently available',
    ],
    correctIndices: [0],
    explanation:
      'The second contradicts the decentralized transfer. The fourth is the opposite of what the slides say: the directory is continuously updated, which is precisely why it always knows, and precisely why it was vulnerable.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-discovery' },
  },
  {
    id: 'q-ceng-dis-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-discovery',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Select every disadvantage Lecture 3 gives for Gnutella query flooding.',
    options: [
      'Search scope can be quite large',
      'Search time can be quite long',
      'Overhead is high, especially when nodes come and go often',
      'It relies on a central directory that can be shut down',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The fourth is Napster\'s weakness, and avoiding it is the reason Gnutella went to the opposite extreme. Its own costs are search scope, search time and churn overhead.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-discovery' },
  },
  {
    id: 'q-ceng-dis-match-1',
    courseId: CENG401_COURSE_ID,
    format: 'matching',
    topicId: 'ceng-discovery',
    difficulty: 'reasoning',
    marks: 3,
    prompt: 'Match each system to how a search is carried out in it.',
    pairs: [
      { left: 'Napster', right: 'The central server is queried and returns the IP addresses of online clients holding the file' },
      { left: 'Gnutella', right: 'The query is asked of neighbors, who forward it onward through the overlay' },
      { left: 'Kazaa', right: 'The query is flooded among super-nodes, each holding the file lists of its ordinary peers' },
    ],
    explanation:
      'All three fetch the file directly from a peer. What differs is only how the holder is found, which is why the lecture groups them as approaches to locating peers.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-discovery' },
  },
  {
    id: 'q-ceng-dis-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-discovery',
    difficulty: 'recall',
    marks: 2,
    prompt: 'Complete the Kazaa super-node rationale.',
    template:
      'Kazaa uses a super-node hierarchy for two reasons. Query ___ means fewer queries are needed than with flat flooding. Stability, because super-node selection favors nodes with high ___, which predicts how long the device will be around in future.',
    blanks: [
      ['consolidation'],
      ['uptime'],
    ],
    explanation:
      'The uptime argument is the interesting one: past presence is used as evidence of future presence, which is the same reasoning a DHT uses when it worries about churn.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-discovery' },
  },
  {
    id: 'q-ceng-dis-written-1',
    courseId: CENG401_COURSE_ID,
    format: 'written-recall',
    topicId: 'ceng-discovery',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'Compare Napster, Gnutella and Kazaa on how peers are located. For each, give the mechanism and one weakness or advantage the lecture attributes to it.',
    answer:
      'Napster uses a central directory: always current, but a single point of failure, a bottleneck and a legal target. Gnutella floods queries to neighbors: fully decentralized, but large search scope, long search time and high churn overhead. Kazaa floods among super-nodes chosen for uptime: fewer queries and more stability, as a middle position.',
    rubric: [
      {
        id: 'r-ceng-dis-1',
        label: 'Describes Napster\'s central directory and a consequence of centralizing it',
        marks: 2,
        keywords: ['central directory', 'central server', 'single point', 'bottleneck', 'lawsuit', 'legal'],
        missedAdvice:
          'The directory is continuously updated and centralized, which gives it a single point of failure, a performance bottleneck and legal exposure.',
      },
      {
        id: 'r-ceng-dis-2',
        label: 'Describes Gnutella\'s query flooding and a consequence',
        marks: 2,
        keywords: ['flood', 'neighbors', 'neighbours', 'decentralized', 'search scope', 'search time', 'overhead'],
        missedAdvice:
          'Gnutella asks neighbors, who ask theirs. Fully decentralized, at the cost of search scope, search time and overhead under churn.',
      },
      {
        id: 'r-ceng-dis-3',
        label: 'Describes Kazaa\'s super-node hierarchy and its motivation',
        marks: 2,
        keywords: ['super-node', 'super node', 'supernode', 'group leader', 'hierarch', 'uptime', 'consolidat'],
        missedAdvice:
          'Kazaa floods among super-nodes rather than all peers, consolidating queries, and picks super-nodes by uptime for stability.',
      },
    ],
    explanation:
      'The three are best learned as one argument: each design is a response to what the previous one got wrong, and an answer that treats them as three unrelated systems misses the line they sit on.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-discovery' },
  },

  /* ── BitTorrent ───────────────────────────────────────────────────────── */
  {
    id: 'q-ceng-bit-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-bittorrent',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Choked and unchoked, in BitTorrent',
    answer:
      'Alice unchokes the four peers currently sending her chunks at the highest rate, meaning she sends to them. Every other peer is choked and receives nothing from her.',
    explanation:
      'Unchoking is about who receives from Alice, decided by who gives to Alice. Reading it the other way round inverts the whole incentive.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-fc-2',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-bittorrent',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Rarest first',
    answer:
      'A peer requests the missing chunks that have the fewest copies among its neighbors first. It avoids starvation when peers depart and balances load by equalizing the number of copies of each chunk.',
    explanation:
      'Requesting in order, as an HTTP client would, leaves everyone holding the same early chunks with nothing to trade, and leaves the last chunks held by nobody.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-bittorrent',
    difficulty: 'recall',
    marks: 2,
    prompt:
      'How often does a BitTorrent peer re-evaluate its top four, and how often does it optimistically unchoke?',
    options: [
      'Top four every 10 seconds, optimistic unchoke every 30 seconds',
      'Top four every 30 seconds, optimistic unchoke every 10 seconds',
      'Both every 10 seconds',
      'Top four every 10 seconds, optimistic unchoke every 60 seconds',
    ],
    correctIndices: [0],
    explanation:
      'The two intervals differ for a reason. Trading partners are reassessed often, while the speculative gift to a random peer is rarer because it costs bandwidth with no return yet.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-mc-2',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-bittorrent',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'A peer has just joined a torrent and holds no chunks. Without optimistic unchoking, what problem would it face?',
    options: [
      'It sends nothing to anyone, so no peer would ever place it in a top four, and it could never start downloading',
      'It could not register with the tracker, so it would not receive a peer list',
      'It would be unable to determine which chunks are rarest',
      'It would download chunks in order rather than rarest first',
    ],
    correctIndices: [0],
    explanation:
      'The top-four rule rewards peers who are already uploading, which is a closed door for a peer with nothing. Optimistic unchoking is the way in: every 30 seconds some peer sends chunks to a random peer regardless of what it has given.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-bittorrent',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Select every statement about a peer joining a torrent that Lecture 3, slides 23 and 24 support.',
    options: [
      'It registers with the tracker to get a list of peer IP addresses',
      'It connects to a subset of peers, say 50, called its neighbors',
      'It can upload chunks to others before it holds the complete file',
      'It must obtain the complete file before it may upload anything',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The last contradicts slide 25 directly: peers B, C and D each hold only some chunks and still pass them between each other. Uploading before completion is what makes the swarm work at all.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-ord-1',
    courseId: CENG401_COURSE_ID,
    format: 'ordering',
    topicId: 'ceng-bittorrent',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Put the BitTorrent architecture sequence from Lecture 3, slides 29 to 34 into order.',
    sequence: [
      'Peer A obtains the .torrent file from a web page that links to it.',
      'A sends a Get or announce request to the tracker.',
      'The tracker returns a list of peers to A.',
      'A exchanges handshakes with peers B and C.',
      'Pieces flow from B and C to A.',
      'A also sends pieces to B while continuing to receive.',
    ],
    explanation:
      'The tracker is contacted second, not first: the .torrent file is what tells a peer which tracker to ask.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-ord-2',
    courseId: CENG401_COURSE_ID,
    format: 'ordering',
    topicId: 'ceng-bittorrent',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Put the reciprocation sequence from Lecture 3, slide 27 into order.',
    sequence: [
      'Alice optimistically unchokes Bob and starts sending him chunks.',
      'Alice becomes one of Bob\'s top-four providers.',
      'Bob reciprocates by sending chunks to Alice.',
      'Bob becomes one of Alice\'s top-four providers.',
    ],
    explanation:
      'The loop closes on itself: a speculative gift produces a rate, the rate produces a place in a top four, and the place produces a steady trade. That is the whole incentive mechanism in four steps.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-match-1',
    courseId: CENG401_COURSE_ID,
    format: 'matching',
    topicId: 'ceng-bittorrent',
    difficulty: 'recall',
    marks: 4,
    prompt: 'Match each BitTorrent term to its meaning in the lecture.',
    pairs: [
      { left: 'Torrent', right: 'The group of peers exchanging chunks of one file' },
      { left: 'Tracker', right: 'The infrastructure node that records participating peers and returns peer lists' },
      { left: 'Churn', right: 'Peers coming and going, including completed peers that leave' },
      { left: 'Free-rider', right: 'A client that receives the file without contributing to its distribution' },
    ],
    explanation:
      'Torrent and tracker are frequently swapped. The torrent is the swarm of peers, and the tracker is the one piece of fixed infrastructure the design still keeps, and DHTs are what let it be dropped.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-bittorrent',
    difficulty: 'recall',
    marks: 3,
    prompt: 'Complete the chunk-exchange rules from Lecture 3, slide 26.',
    template:
      'Alice requests missing chunks from her peers ___ first, meaning the chunks with the fewest copies among her neighbors. She sends chunks to the ___ peers currently sending to her at the highest rate. Every ___ seconds she randomly selects another peer and starts sending to it.',
    blanks: [
      ['rarest', 'rarest chunk'],
      ['four', '4', 'top four', 'top 4'],
      ['30', 'thirty'],
    ],
    explanation:
      'Two different rules with two different jobs: rarest first decides what to ask for, and the top four plus optimistic unchoking decide who to give to.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },
  {
    id: 'q-ceng-bit-written-1',
    courseId: CENG401_COURSE_ID,
    format: 'written-recall',
    topicId: 'ceng-bittorrent',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'Explain how BitTorrent discourages free-riding. Cover the top-four rule, optimistic unchoking, and why a higher upload rate benefits the uploading peer itself.',
    answer:
      'A peer sends only to the four peers sending to it fastest, re-evaluated every 10 seconds, so a peer that uploads nothing is choked by everyone. Optimistic unchoking every 30 seconds gives a random peer a chance regardless, which lets newcomers start. Uploading faster wins places in other peers\' top fours, so a peer gets the file faster by giving more.',
    rubric: [
      {
        id: 'r-ceng-bit-1',
        label: 'States the top-four rule and its 10-second re-evaluation',
        marks: 2,
        keywords: ['top four', 'top 4', 'four peers', '10 sec', 'ten sec', 'highest rate', 'unchoke'],
        missedAdvice:
          'A peer sends to the four peers currently sending to it at the highest rate, re-evaluated every 10 seconds. Everyone else is choked.',
      },
      {
        id: 'r-ceng-bit-2',
        label: 'Explains optimistic unchoking and why a newcomer needs it',
        marks: 2,
        keywords: ['optimistic', '30 sec', 'thirty', 'random', 'newcomer', 'new peer', 'no chunks'],
        missedAdvice:
          'Every 30 seconds a peer sends to a randomly chosen peer. Without it a peer holding nothing could never earn a place in anyone\'s top four.',
      },
      {
        id: 'r-ceng-bit-3',
        label: 'Explains the self-interested benefit: better trading partners, so the file arrives sooner',
        marks: 2,
        keywords: ['trading partner', 'faster', 'get the file', 'reciprocat', 'self-interest', 'own benefit'],
        missedAdvice:
          'The slide answers its own question: a higher upload rate finds better trading partners, so the peer gets the file faster. The incentive is self-interest, not altruism.',
      },
    ],
    explanation:
      'The mechanism is worth stating as an incentive rather than a rule: BitTorrent does not forbid free-riding, it just makes contributing the faster way to finish.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-bittorrent' },
  },

  /* ── DHT, churn, blockchain ───────────────────────────────────────────── */
  {
    id: 'q-ceng-dht-fc-1',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-dht',
    difficulty: 'recall',
    marks: 1,
    prompt: 'How keys and peers get their IDs in a DHT',
    answer:
      'key = hash(object name) gives an object ID, and value = hash(IP address) gives a peer ID. Both are mapped onto the same circular ID space.',
    explanation:
      'The shared space is what makes "closest peer" meaningful. Two different hashes feeding one circle is the whole trick.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-dht' },
  },
  {
    id: 'q-ceng-dht-fc-2',
    courseId: CENG401_COURSE_ID,
    format: 'flashcard',
    topicId: 'ceng-dht',
    difficulty: 'recall',
    marks: 1,
    prompt: 'The assignment rule in a circular DHT',
    answer:
      'A key-value pair is assigned to the peer with the closest ID, and the convention for closest is the immediate successor.',
    explanation:
      'Successor, not nearest in either direction. A key just above a peer travels forward to the next one rather than back to the peer it passed.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-dht' },
  },
  {
    id: 'q-ceng-dht-mc-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-dht',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'With peers 1, 12, 13, 25, 32, 40, 48, 60 and keys 0 to 63, which peer is key 51 assigned to?',
    options: ['Peer 60', 'Peer 48', 'Peer 1', 'Peer 40'],
    correctIndices: [0],
    explanation:
      'The immediate successor of 51 is 60. Peer 48 is the closest peer numerically, which is why it is the tempting answer, but the convention is successor rather than nearest.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-dht' },
  },
  {
    id: 'q-ceng-dht-mc-2',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-dht',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'With the same eight peers, which peer holds key 60, and which holds key 11?',
    options: [
      'Key 60 goes to peer 60, and key 11 goes to peer 12',
      'Key 60 goes to peer 1, and key 11 goes to peer 12',
      'Key 60 goes to peer 60, and key 11 goes to peer 1',
      'Key 60 goes to peer 48, and key 11 goes to peer 13',
    ],
    correctIndices: [0],
    explanation:
      'A key equal to a peer ID stays with that peer, because the successor relation includes equality. Key 11 travels forward to 12 rather than back to 1.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-dht' },
  },
  {
    id: 'q-ceng-dht-mc-3',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'ceng-dht',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'What does adding shortcuts to a circular DHT change about lookup cost?',
    options: [
      'From O(N) messages on average to a design with O(log N) neighbors and O(log N) messages',
      'From O(N) to O(1) messages, because every peer knows every other',
      'Nothing: shortcuts reduce storage rather than messages',
      'From O(log N) to O(N), because more neighbors means more forwarding',
    ],
    correctIndices: [0],
    explanation:
      'The illustrated query for key 53 falls from 6 messages to 3, going 12 to 32 to 48 to 60. Each peer still knows only a small number of others, which is what keeps it O(log N) rather than O(1).',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-dht' },
  },
  {
    id: 'q-ceng-dht-ms-1',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-dht',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Select every step of the churn procedure Lecture 3, slide 51 describes.',
    options: [
      'Each peer knows the addresses of its two successors',
      'Each peer periodically pings its two successors to check aliveness',
      'If the immediate successor leaves, the next successor becomes the new immediate successor',
      'The departing peer hands its keys to its predecessor before leaving',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The fourth is not in the slides, and churn is defined as peers that "may come and go", including abrupt departures. The whole point of tracking two successors is to survive a departure that gave no warning.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-churn' },
  },
  {
    id: 'q-ceng-dht-ord-1',
    courseId: CENG401_COURSE_ID,
    format: 'ordering',
    topicId: 'ceng-dht',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Peer 5 abruptly leaves a ring of peers 1, 3, 4, 5, 8, 10, 12, 15. Put peer 4\'s repair steps into order.',
    sequence: [
      'Peer 4 pings peer 5 and detects its departure.',
      'Peer 4 makes peer 8, its second successor, its new immediate successor.',
      'Peer 4 asks peer 8 who its immediate successor is.',
      'Peer 4 records peer 8\'s successor as its own second successor.',
    ],
    explanation:
      'The repair restores the invariant that every peer knows two successors, which is what makes the next departure survivable too.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-churn' },
  },
  {
    id: 'q-ceng-dht-blank-1',
    courseId: CENG401_COURSE_ID,
    format: 'fill-blank',
    topicId: 'ceng-dht',
    difficulty: 'reasoning',
    marks: 3,
    prompt: 'Complete the lookup description from Lecture 3, slides 48 and 49.',
    template:
      'In a plain circular DHT each peer knows only its immediate ___ and predecessor, and resolving a query takes O(___) messages on average. Adding shortcuts cut the illustrated lookup for key 53 from six messages to ___.',
    blanks: [
      ['successor'],
      ['n'],
      ['three', '3'],
    ],
    explanation:
      'The route with shortcuts is 12 to 32 to 48 to 60, which is three forwarding messages rather than six along the full successor chain.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-dht' },
  },
  {
    id: 'q-ceng-dht-match-1',
    courseId: CENG401_COURSE_ID,
    format: 'matching',
    topicId: 'ceng-dht',
    difficulty: 'reasoning',
    marks: 4,
    prompt: 'Match each DHT element to its role.',
    pairs: [
      { left: 'hash(object name)', right: 'Produces the key, an object ID in the shared space' },
      { left: 'hash(IP address)', right: 'Produces the value, a peer ID in the same space' },
      { left: 'Immediate successor', right: 'The peer a key is assigned to under the closest-ID convention' },
      { left: 'Shortcut', right: 'An extra known peer that skips part of the successor chain during lookup' },
    ],
    explanation:
      'Keeping key and value straight matters here because both are numbers in the same circle: the key is what is being looked up, and the value is the peer that answers.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-dht' },
  },
  {
    id: 'q-ceng-dht-ms-2',
    courseId: CENG401_COURSE_ID,
    format: 'multiple-select',
    topicId: 'ceng-dht',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Select every statement Lecture 3, slide 52 makes about blockchain networks as P2P architecture.',
    options: [
      'Nodes communicate directly with other nodes over the P2P network',
      'No single entity can approve a transaction, so nodes must reach consensus',
      'A formed block is sent to all nodes in the network to be validated',
      'A central validator signs each block before it is distributed',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The fourth is what the decentralized model rules out, and it is the reason consensus is needed at all. Each successive block also contains a hash fingerprint of the previous one, so altering an old block breaks every link after it.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-churn' },
  },
  {
    id: 'q-ceng-dht-written-1',
    courseId: CENG401_COURSE_ID,
    format: 'written-recall',
    topicId: 'ceng-dht',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'With peers 1, 12, 13, 25, 32, 40, 48, 60 and keys 0 to 63, state which peer holds keys 51, 60 and 11, and explain the rule you applied. Then say how a lookup for key 53 starting at peer 12 proceeds with and without shortcuts.',
    answer:
      'Keys 51 and 60 both go to peer 60, and key 11 goes to peer 12, by assigning each key to its immediate successor. Without shortcuts the query travels 12, 13, 25, 32, 40, 48 to 60, six messages. With shortcuts it travels 12 to 32 to 48 to 60, three messages.',
    rubric: [
      {
        id: 'r-ceng-dht-1',
        label: 'Assigns the three keys correctly: 51 to 60, 60 to 60, 11 to 12',
        marks: 2,
        keywords: ['peer 60', '60', 'peer 12', '12'],
        missedAdvice:
          'Key 51 goes forward to 60, key 60 stays with peer 60 because the successor relation includes equality, and key 11 goes forward to 12.',
      },
      {
        id: 'r-ceng-dht-2',
        label: 'States the immediate-successor convention rather than nearest peer',
        marks: 2,
        keywords: ['successor', 'immediate', 'closest id', 'convention', 'forward'],
        missedAdvice:
          'The rule is the closest ID, with closest defined by convention as the immediate successor. Nearest in either direction would send key 51 to peer 48.',
      },
      {
        id: 'r-ceng-dht-3',
        label: 'Contrasts the successor chain with the shortcut route for key 53',
        marks: 2,
        keywords: ['chain', 'six', '6 messages', 'three', '3 messages', 'shortcut', 'o(log n)', 'o(n)'],
        missedAdvice:
          'The successor chain forwards through every peer in between, six messages, and is O(N) on average. Shortcuts take 12 to 32 to 48 to 60, three messages, and can be designed for O(log N).',
      },
    ],
    explanation:
      'The assignment rule and the lookup route are separate pieces of the same design, and quiz questions on DHTs usually ask for one and check whether the other is understood.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-dht' },
  },
  {
    id: 'q-ceng-dht-src-1',
    courseId: CENG401_COURSE_ID,
    format: 'source-analysis',
    topicId: 'ceng-dht',
    difficulty: 'stretch',
    marks: 5,
    prompt:
      'Using this extract, explain why each peer tracks two successors rather than one, and what would go wrong with only one.',
    extract:
      'Handling peer churn. Peers may come and go. Each peer knows the address of its two successors. Each peer periodically pings its two successors to check aliveness. If the immediate successor leaves, the peer chooses the next successor as its new immediate successor.',
    answer:
      'The second successor is the replacement, known in advance. With only one successor a peer whose successor departed would have no one to forward to and no way to find the next peer around the ring without a broader repair.',
    rubric: [
      {
        id: 'r-ceng-chu-1',
        label: 'Says the second successor is already known and becomes the replacement',
        marks: 2,
        keywords: ['second successor', 'replacement', 'already know', 'next successor', 'promote'],
        missedAdvice:
          'The repair is immediate precisely because the replacement was known before the departure: the next successor is promoted.',
      },
      {
        id: 'r-ceng-chu-2',
        label: 'Explains that with one successor the ring would break at the departure',
        marks: 2,
        keywords: ['break', 'broken', 'no one', 'cannot forward', 'lost', 'gap', 'no way to find'],
        missedAdvice:
          'With a single successor, the peer loses its only forward link and the ring is broken at that point until some wider repair finds the next peer.',
      },
      {
        id: 'r-ceng-chu-3',
        label: 'Mentions periodic pinging as how departure is detected',
        marks: 1,
        keywords: ['ping', 'periodic', 'aliveness', 'detect', 'check'],
        missedAdvice:
          'Peers periodically ping both successors to check aliveness, which is how an abrupt departure is noticed at all.',
      },
    ],
    explanation:
      'Churn is the assumption that separates a DHT from an ordinary hash table: the machines holding the data are expected to vanish without notice, and the design has to keep working when they do.',
    source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-churn' },
  },
];
