import type { Course, Material, Topic } from '../types.ts';

/**
 * CENG 401, Network Servers and Architectures: a real course, seeded.
 *
 * ── What makes this one different from the two sample courses ─────────────
 *
 * The Atlantic and Statistics courses are inventions. Their authors, books and
 * data sets were written for this prototype and every surface that shows them
 * says so. This course is not. It is the student's own module, and the three
 * materials below carry the lecturer's actual slide text, converted from the
 * three PDFs to Markdown *outside the app* and seeded here.
 *
 * That difference is carried in the data rather than in a comment, through
 * `origin: 'imported'`. It matters in both directions:
 *
 *   * the material must not be labelled fictional, because it is not, and a
 *     student revising from it needs to trust that the words are the
 *     lecturer's;
 *   * the material must not imply Rawi grew a PDF parser, because it did not.
 *     The conversion happened elsewhere, it can flatten a subscript or
 *     interleave a column, and the original slide is still where a
 *     disagreement gets settled. `ImportedNotice` says exactly that.
 *
 * ── Why the passages keep slide numbers ───────────────────────────────────
 *
 * Every passage heading names its lecture and slide range, and every question
 * that has a source points at one. Revising the night before a quiz means
 * moving between the app and the deck constantly, and a passage that cannot be
 * found in the original deck in five seconds is a passage that will not be
 * checked.
 *
 * ── The numbers are the lecture's ─────────────────────────────────────────
 *
 * The user-counts, market shares and protocol tables are statements the slides
 * make, not independently verified current facts, so nothing here quizzes a
 * student on them as though they were. What is examined is the reasoning the
 * course is actually about: which term limits a distribution time, which
 * socket call comes next, which peer a key lands on.
 *
 * The one deliberate oddity kept as-is is the "256Kb chunks" spelling on
 * lecture 3, slide 23. It is the slide's, it is ambiguous, and silently
 * rewriting it to KB would be inventing precision the source does not have.
 */

export const CENG401_COURSE_ID = 'course-ceng401';

export const CENG401_COURSE: Course = {
  id: CENG401_COURSE_ID,
  name: 'CENG 401: Network Servers and Architectures',
  description:
    'Internet infrastructure, transport protocols and peer-to-peer architecture, taught by Dr. Ali Alnoman in Fall 2026. Seeded from the first three lecture decks.',
  goal: 'Work the distribution-time and delay calculations under time pressure, and trace socket code without the slides.',
  accent: 'violet',
  createdAt: new Date().toISOString(),
};

/* ── Topics ───────────────────────────────────────────────────────────── */

/**
 * Ten topics across three lectures.
 *
 * The grouping follows what gets examined together rather than what sits on
 * the same slide. The four delay components and throughput are one topic
 * because a question about one is nearly always a question about both; the
 * socket APIs are separated from the UDP/TCP comparison because knowing that
 * TCP is connection-oriented and knowing that `accept()` returns a *second*
 * socket are genuinely different pieces of knowledge, and the second is the
 * one that gets dropped.
 *
 * Priorities reflect what the calculations and code-tracing questions demand,
 * which is where marks are actually won and lost.
 */
export const CENG401_TOPICS: Topic[] = [
  {
    id: 'ceng-servers',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 1: The Internet',
    order: 0,
    title: 'Server roles, client-server, cloud and edge',
    summary:
      'What a network server provides, how the client-server model divides the work, and what cloud and edge deployment each change about it.',
    priority: 'normal',
    relatedTopicIds: ['ceng-delay', 'ceng-scaling'],
  },
  {
    id: 'ceng-delay',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 1: The Internet',
    order: 1,
    title: 'Throughput, bottlenecks and the four delay components',
    summary:
      'Per-connection throughput as a minimum of three rates, and the four delays that add up at a node, with the two that are calculated.',
    priority: 'high',
    relatedTopicIds: ['ceng-servers', 'ceng-scaling', 'ceng-p2p-time'],
  },
  {
    id: 'ceng-scaling',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 1: The Internet',
    order: 2,
    title: 'Scaling, security, availability, energy and AI',
    summary:
      'The remaining infrastructure challenges: horizontal scaling and load balancing, DDoS and Zero Trust, redundancy, data-centre energy, and where AI is applied.',
    priority: 'normal',
    relatedTopicIds: ['ceng-servers', 'ceng-delay'],
  },
  {
    id: 'ceng-transport',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 2: Socket Programming',
    order: 3,
    title: 'UDP versus TCP, headers and demultiplexing',
    summary:
      'What the transport layer provides, the two headers, and the difference between demultiplexing on a port and on a four-part connection endpoint.',
    priority: 'high',
    relatedTopicIds: ['ceng-quic', 'ceng-sockets'],
  },
  {
    id: 'ceng-quic',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 2: Socket Programming',
    order: 4,
    title: 'QUIC, HTTP/3 and MQTT',
    summary:
      'Reliable multiplexed streams over UDP, and the publish-subscribe broker model IoT prefers to request-response.',
    priority: 'normal',
    relatedTopicIds: ['ceng-transport'],
  },
  {
    id: 'ceng-sockets',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 2: Socket Programming',
    order: 5,
    title: 'Socket APIs and client-server interaction order',
    summary:
      'The UDP and TCP calls in Python, the order the two sides run them in, and the welcoming socket against the connection socket it returns.',
    priority: 'high',
    relatedTopicIds: ['ceng-transport'],
  },
  {
    id: 'ceng-p2p-time',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 3: Peer-to-Peer',
    order: 6,
    title: 'File distribution time: client-server versus P2P',
    summary:
      'The two lower bounds, the term that limits each one, and why added peers make P2P grow more slowly than linearly.',
    priority: 'high',
    relatedTopicIds: ['ceng-delay', 'ceng-bittorrent'],
  },
  {
    id: 'ceng-discovery',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 3: Peer-to-Peer',
    order: 7,
    title: 'Peer discovery: Napster, Gnutella and Kazaa',
    summary:
      'Central directory, query flooding and super-node hierarchy, and what each one trades away.',
    priority: 'normal',
    relatedTopicIds: ['ceng-bittorrent', 'ceng-dht'],
  },
  {
    id: 'ceng-bittorrent',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 3: Peer-to-Peer',
    order: 8,
    title: 'BitTorrent: trackers, chunks, choking and incentives',
    summary:
      'How a peer joins a torrent, why chunks are requested rarest first, and the top-four and optimistic-unchoking rules that make contributing pay.',
    priority: 'high',
    relatedTopicIds: ['ceng-p2p-time', 'ceng-discovery'],
  },
  {
    id: 'ceng-dht',
    courseId: CENG401_COURSE_ID,
    module: 'Lecture 3: Peer-to-Peer',
    order: 9,
    title: 'Hashing, DHTs, peer churn and blockchain',
    summary:
      'Keys and peer IDs in one circular space, the immediate-successor rule, lookup cost with and without shortcuts, and what churn and blockchain add.',
    priority: 'high',
    relatedTopicIds: ['ceng-discovery', 'ceng-bittorrent'],
  },
];

/* ── Materials ────────────────────────────────────────────────────────── */

/**
 * Seeded the day the course is added, rather than backdated.
 *
 * The two sample courses backdate their materials to make a fortnight of
 * seeded history plausible. This course has no history, invented or
 * otherwise: the student has not sat anything in it yet, and a reading dated
 * before it existed would be the first small lie in a course whose whole point
 * is that it is real.
 */
const ADDED = new Date().toISOString();

export const CENG401_MATERIALS: Material[] = [
  {
    id: 'mat-ceng-l1',
    courseId: CENG401_COURSE_ID,
    title: 'Lecture 1: The Internet',
    kind: 'lecture-notes',
    origin: 'imported',
    attribution: 'Dr. Ali Alnoman, CENG 401, Fall 2026. Lecture 1.pdf, 25 slides.',
    fileName: 'Lecture 1.pdf',
    topicIds: ['ceng-servers', 'ceng-delay', 'ceng-scaling'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-ceng-l1-intro',
        heading: 'Slides 2 to 5: servers, the client-server model and server types',
        topicIds: ['ceng-servers'],
        text: `Network servers are systems that provide computing, storage, and communication services to network clients. Network architecture defines how clients, servers, routers, and services are organized and connected. Internet infrastructure is a massive distributed system connecting users, devices, networks, and data centers. The modern challenges named in this lecture are congestion, delay, traffic load, security, scalability, reliability, and energy consumption. AI is increasingly used to monitor, optimize, secure, and automate networks and servers.

What is a network server? A server provides resources or services to other devices over a network. Servers receive client requests, process them, and return appropriate responses. One server can serve many clients simultaneously. Examples are web, DNS, database, email, application, and file servers.

The client-server model. A client requests a service, such as opening a website or retrieving data. The network transports requests and responses between clients and servers. The server processes requests and provides the requested service. Communication follows protocols such as HTTP, DNS, TCP, and IP. A single server can simultaneously handle requests from thousands or millions of clients.

Types of network servers. A web server delivers web pages, files, and web-based content. A database server stores, retrieves, and manages structured information. A DNS server converts human-readable domain names into IP addresses. A file or storage server provides centralized access to files and digital storage.`,
      },
      {
        id: 'p-ceng-l1-cloud-edge',
        heading: 'Slides 6 to 8: cloud, edge, and how traffic reaches a server',
        topicIds: ['ceng-servers', 'ceng-scaling'],
        text: `Cloud-based server architecture. Computing and storage can be provisioned when required. Resources can increase or decrease according to application demand, which is elastic scaling. Cloud providers operate large numbers of interconnected data centers. A pay-as-you-use model lets organizations avoid purchasing all physical infrastructure upfront.

Edge computing. Processing is moved closer to users and connected devices. Shorter communication paths can improve response times, which is lower latency. Local processing reduces the amount of raw data sent to the cloud, which reduces bandwidth. Edge computing benefits IoT, autonomous systems, gaming, and industrial applications. Distributed edge infrastructure creates additional management and security requirements.

How Internet traffic reaches a server. DNS converts a domain name into an IP address. Packets are forwarded through multiple routers. Routing determines paths across interconnected networks. CDNs can serve content from geographically closer locations. Load balancers distribute requests across multiple servers.`,
      },
      {
        id: 'p-ceng-l1-load',
        heading: 'Slides 9 to 13: traffic load, and the lecture statistics',
        topicIds: ['ceng-scaling'],
        text: `Challenge 1, Internet traffic load. The number of users and connected devices continues to grow. Video and cloud applications generate large amounts of traffic. IoT devices create continuous machine-generated traffic. AI applications can generate substantial data movement. Traffic demand can vary significantly between normal and peak periods.

The slides quote figures to give that growth a scale. Slide 10 charts Internet users in millions from 2005 to 2024, ending at 5,500 million, under the heading "About 6 Billion Internet Users!", sourced to statista.com. Slide 11 lists application figures: 4.5B people use email and 375B emails are sent per day, there are 1.1B websites, YouTube sees 4B videos watched per day with 500 hours uploaded per minute, Facebook has 2.7B users and 250B photos with 350M uploaded every day, and ChatGPT has 190M users per day and more than 2.5 billion messages per day globally. Slide 12 gives browser share as Chrome 67%, Safari 18%, Edge 5%, Firefox 3%, and search share as Google 90%, bing 4%, Yandex 2%, Yahoo! 1%, sourced to statcounter.com. Slide 13 charts AI chatbot share from July 2024 to July 2025 as ChatGPT 81.43%, Perplexity 10.85%, Microsoft Copilot 3.79%, Google Gemini 2.19%, Deepseek 1.06%, Claude 0.68%.

These are figures the lecture quotes from those sources. They date quickly and they are not what the reasoning in this course rests on.`,
      },
      {
        id: 'p-ceng-l1-throughput',
        heading: 'Slides 14 to 16: congestion and throughput',
        topicIds: ['ceng-delay'],
        text: `Challenge 2, network and link congestion. Congestion occurs when traffic demand exceeds available capacity. Packets accumulate in network queues. Queueing causes increasing delays. Severe congestion can cause packet loss. Congestion control and traffic engineering help manage overload.

Throughput is the rate, in bits per time unit, at which bits are being sent from sender to receiver. Instantaneous throughput is the rate at a given instant of time. Average throughput is the rate over a longer period of time. The slide draws this as fluid through a pipe: a server sends a file of F bits into a pipe that carries at R_s bits per second, which feeds a second pipe that carries at R_c bits per second, and the bits arrive at the client.

Slide 16 puts that in a network. The per-connection end-to-end throughput is min(R_c, R_s, R/10), where R is the capacity of a backbone link shared by ten connections. In practice R_c or R_s is often the bottleneck. The third term only binds when the shared link is congested enough that one connection's fair share of it falls below both access rates.`,
      },
      {
        id: 'p-ceng-l1-nodal',
        heading: 'Slides 17 to 20: the four delay components, and packet loss',
        topicIds: ['ceng-delay'],
        text: `Challenge 3, network delay. Propagation delay depends on physical distance. Transmission delay depends on packet size and link capacity. Processing delay occurs inside network devices. Queueing delay increases during congestion. Low latency is critical for real-time applications.

The four sources add at a node:

d_nodal = d_proc + d_queue + d_trans + d_prop

Nodal processing, d_proc, is the time to check bit errors and determine the output link. It is typically in microseconds. Queueing delay, d_queue, is the time waiting at the output link for transmission, and it depends on the congestion level of the router. These two are described rather than calculated.

The other two are calculated. Transmission delay is d_trans = L / R, where L is packet length in bits and R is the link transmission rate in bits per second. It is the time to push the packet onto the link. Propagation delay is d_prop = d / s, where d is the length of the physical link and s is the propagation speed, approximately 2 x 10^8 m/sec. It is the time for a bit to travel that distance. The slide states plainly that d_trans and d_prop are different, and neither depends on the other: a short packet on a slow link and a long packet on a fast link can give the same d_trans, while d_prop does not care about the packet at all.

Challenge 4, packet loss. Packets may be dropped because of congestion. Network errors can also cause packet loss. Lost packets may require retransmission. Retransmissions consume additional network resources. High packet loss can significantly degrade application performance.`,
      },
      {
        id: 'p-ceng-l1-challenges',
        heading: 'Slides 21 to 25: scalability, security, availability, energy and AI',
        topicIds: ['ceng-scaling'],
        text: `Challenge 5, scalability. Internet applications must support rapidly changing demand. More users require additional computing resources. Horizontal scaling adds additional server instances. Load balancing distributes workloads across servers. Autoscaling helps respond dynamically to traffic changes.

Challenge 6, security. DDoS attacks can overwhelm networks and servers. Malware and botnets generate malicious traffic. Unauthorized access threatens applications and data. Encryption protects information during communication. Continuous monitoring and Zero Trust improve security.

Challenge 7, reliability and availability. Hardware and software failures can interrupt services. Network links and data centers can experience outages. Redundant servers improve service availability. Load balancing can redirect traffic from failed systems. Disaster recovery is essential for critical services.

Challenge 9, energy and sustainability. Data centers consume substantial amounts of electricity. AI workloads increase computing and cooling requirements. Network infrastructure also consumes significant energy. Efficient hardware and workload management can reduce consumption. Sustainable infrastructure is becoming an important design objective. The deck numbers this challenge 9 and has no slide numbered challenge 8.

AI-driven networks and servers. AI can dynamically optimize traffic routing. Intelligent load balancing can distribute workloads. AI can predict resource requirements and traffic peaks. AI can detect security threats and anomalies. AI agents can assist with monitoring and automated remediation.`,
      },
    ],
  },
  {
    id: 'mat-ceng-l2',
    courseId: CENG401_COURSE_ID,
    title: 'Lecture 2: Socket Programming',
    kind: 'lecture-notes',
    origin: 'imported',
    attribution: 'Dr. Ali Alnoman, CENG 401, Fall 2026. Lecture 2.pdf, 26 slides.',
    fileName: 'Lecture 2.pdf',
    topicIds: ['ceng-transport', 'ceng-quic', 'ceng-sockets'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-ceng-l2-transport',
        heading: 'Slides 2 and 3: transport services and the two basic features',
        topicIds: ['ceng-transport'],
        text: `Transport layer protocols provide logical communication between processes, meaning between applications rather than between hosts. The sender divides the message into segments, which is segmentation, and the receiver reassembles the segments into a message. Transport layer services include demultiplexing packets, detecting corrupted data such as with the Internet checksum, reliable delivery, flow control, and congestion control.

Two basic transport features carry most of the lecture. The first is demultiplexing using port numbers. A client sends a service request to 128.2.194.242:80. The server host runs a web server on port 80 and an echo server on port 7, and the operating system uses the port number to deliver the request to the web server rather than the echo server. The second is error detection using checksums.`,
      },
      {
        id: 'p-ceng-l2-udp',
        heading: 'Slides 4 to 6: UDP, its applications, and connectionless demultiplexing',
        topicIds: ['ceng-transport'],
        text: `User Datagram Protocol. UDP is lightweight communication between processes that avoids the communication overhead of ordered and reliable delivery. Its header overhead is small: the UDP header is only eight bytes long, excluding the application data. There is no connection setup and therefore less delay, because UDP sends without establishing a connection and there is no handshake.

The header is four fields in two 32-bit rows: source port and destination port, then length and checksum. Those four fields are the eight bytes, and the application data follows.

Popular applications that use UDP. Multimedia streaming, because retransmitting packets is not worthwhile when a small amount of data loss can be accepted, with VoIP, video conferencing and IPTV as examples. Simple query-response protocols, to avoid the overhead of connection establishment which can be overwhelming to network resources, with DNS and DHCP as examples.

Connectionless demultiplexing, slide 6. A server creates a DatagramSocket on port 6428. One client uses port 9157, another uses port 5775. The left client's datagram carries source port 9157 and destination port 6428, and the reply carries source port 6428 and destination port 9157. The slide leaves the right-hand client's port labels as question marks: the same rule fills them in as 5775 to 6428 outbound and 6428 to 5775 back. A UDP socket is identified by its destination IP address and destination port number alone, so datagrams from both clients arrive at the same socket and are told apart by the source address the receive call also returns.`,
      },
      {
        id: 'p-ceng-l2-tcp',
        heading: 'Slides 7 to 11: TCP, connection-oriented demultiplexing, and the protocol table',
        topicIds: ['ceng-transport'],
        text: `Transmission Control Protocol. TCP is a stream-of-bytes service: it sends and receives a stream of bytes, and each byte, not each packet, is given a sequence number. It provides reliable, in-order delivery, with error detection by checksum, detection of losses and out-of-order bytes using sequence numbers, and reliable delivery through acknowledgments and retransmissions. The header carries source port, destination port, sequence number, acknowledgement number, header length, flags U A P R S F, receive window, checksum, urgent data pointer, and variable-length options.

TCP is connection-oriented, with explicit set-up and tear-down of connections. Flow control prevents overflow of the receiver's buffer space. Congestion control adapts to network congestion for the greater good, with TCP RENO and TCP TAHOE as examples.

Connection-oriented demultiplexing, slides 9 and 10. Three segments all arrive at IP address B, port 80. Their source endpoints are A:9157, C:5775 and C:9157. They are demultiplexed to three different sockets. A TCP socket is identified by four values, source IP address, source port, destination IP address and destination port, so two connections from the same host C are separated by their source ports, and a connection from a different host A is separated by its source IP address. Slide 10 shows the same three connections handled by threads inside one server process, which changes how the server is organized but not how the segments are demultiplexed.

Slide 11 tabulates applications against protocols: electronic mail SMTP over TCP, remote terminal access Telnet over TCP, web HTTP over TCP, file transfer FTP over TCP, remote file server NFS typically UDP, streaming multimedia typically proprietary over UDP or TCP, Internet telephony typically proprietary over UDP or TCP, network management SNMP typically UDP, and name translation DNS typically UDP. That table is the lecture's summary, not a rule holding for every version of every protocol, and slide 12 discusses QUIC separately.`,
      },
      {
        id: 'p-ceng-l2-quic',
        heading: 'Slides 12 and 13: QUIC, HTTP/3 and MQTT',
        topicIds: ['ceng-quic'],
        text: `QUIC and HTTP/3. QUIC is particularly important because it uses UDP but provides reliable, multiplexed streams, flow control, low-latency connection establishment, security, and connection migration. As modern Internet transport, QUIC is used by HTTP/3 and runs over UDP, provides reliable delivery, integrates TLS, and reduces connection-establishment latency.

The point to hold is that "runs over UDP" and "is unreliable" are not the same statement. QUIC takes UDP's lack of connection setup and builds reliability, ordering and multiplexing above it, rather than inheriting TCP's.

IoT networks. The Internet of Things generally prefers publish-subscribe application layer protocols such as MQTT, Message Queue Telemetry Transport, over request-response protocols such as HTTP. MQTT uses TCP. The publish-subscribe model uses a broker node between IoT sensors and the end-server. The sensors need not know the recipient, and vice versa, and need not be online at the same time.`,
      },
      {
        id: 'p-ceng-l2-udp-code',
        heading: 'Slides 14 to 21: sockets, and the UDP client and server',
        topicIds: ['ceng-sockets'],
        text: `A socket is the door between an application process and the end-to-end transport protocol. The application developer controls what is above the socket; the operating system controls the transport, network, link and physical layers below it.

The application used throughout is the same one for both protocols. The client reads a line of characters from its keyboard and sends it to a server. The server receives the data and converts all characters to uppercase. The server sends the modified data back. The client receives the modified characters and displays them.

The UDP interaction order, slide 16. The server creates a socket associated with port x. The client creates a socket. The client creates a datagram with the server IP and port x and sends it. The server reads the datagram and writes a reply, specifying the client's address and port number. The client reads the reply and closes its socket. Both sides call socket(AF_INET, SOCK_DGRAM), where AF_INET indicates the underlying network is using IPv4 and SOCK_DGRAM means a UDP socket.

UDPServer.py:

    from socket import *
    serverPort = 12000
    serverSocket = socket(AF_INET, SOCK_DGRAM)
    serverSocket.bind(('', serverPort))
    print('The server is ready to receive')
    while 1:
        message, clientAddress = serverSocket.recvfrom(2048)
        modifiedMessage = message.upper()
        serverSocket.sendto(modifiedMessage, clientAddress)
        print(clientAddress)

The bind call assigns port number 12000 to the server's socket, so the application developer is explicitly assigning the port. When anyone sends a packet to port 12000 at the server's IP address, that packet is directed to this socket. The while loop lets the server receive and process packets from clients indefinitely. The method recvfrom takes the buffer size 2048 as input and returns both the message and the client's address, which is the client IP and port. That returned address is what sendto uses to reply. The final print is optional.

UDPClient.py:

    from socket import *
    serverName = 'hostname'
    serverPort = 12000
    clientSocket = socket(AF_INET, SOCK_DGRAM)
    message = input('Input lowercase sentence:')
    clientSocket.sendto(message.encode('ascii'), (serverName, serverPort))
    modifiedMessage, serverAddress = clientSocket.recvfrom(2048)
    print(modifiedMessage.decode('ascii'))
    clientSocket.close()

The client attaches the server name and port to the message on every sendto, because nothing has established where the datagrams go. Note also that the client never binds: the operating system assigns its port.`,
      },
      {
        id: 'p-ceng-l2-tcp-code',
        heading: 'Slides 22 to 26: the TCP client and server, and the two sockets',
        topicIds: ['ceng-sockets'],
        text: `Socket programming with TCP. The client must contact the server. The server process must first be running, and must have created a socket, a door, that welcomes the client's message. The client contacts the server by creating a TCP socket specifying the IP address and port number of the server process, and when the client creates the socket, client TCP establishes a connection with the server. When contacted by a client, the server creates a new socket to communicate with that particular client. This allows the server to talk with multiple clients, and the source port numbers are used to distinguish them.

The TCP interaction order, slide 23. The server creates a welcoming socket on port x for incoming requests and waits for an incoming TCP connection request. The client creates a socket and connects to that host and port. Connection setup occurs, and the server's accept() returns a new connectionSocket. The client sends its request using clientSocket; the server reads it from connectionSocket. The server writes the reply to connectionSocket; the client reads it from clientSocket. Then connectionSocket and clientSocket close. The welcoming socket is not the socket the conversation happens on, and it stays open for the next client.

TCPServer.py:

    from socket import *
    serverPort = 12000
    serverSocket = socket(AF_INET, SOCK_STREAM)
    serverSocket.bind(('', serverPort))
    serverSocket.listen(1)
    print('The server is ready to receive')
    while 1:
        connectionSocket, addr = serverSocket.accept()
        print(addr)
        sentence = connectionSocket.recv(1024)
        capitalizedSentence = sentence.upper()
        connectionSocket.send(capitalizedSentence)
        connectionSocket.close()

SOCK_STREAM indicates a TCP socket. The listen call begins listening for incoming TCP requests. The server waits on accept() for incoming requests, and a new socket is created on return. The server reads bytes from that socket with recv, without a sender address, unlike UDP's recvfrom, because the connection already identifies the other end.

TCPClient.py:

    from socket import *
    serverName = 'hostname'
    serverPort = 12000
    clientSocket = socket(AF_INET, SOCK_STREAM)
    clientSocket.connect((serverName, serverPort))
    sentence = input('Input lowercase sentence:')
    clientSocket.send(sentence.encode('ascii'))
    modifiedSentence = clientSocket.recv(1024)
    print('From Server:', modifiedSentence.decode('ascii'))
    clientSocket.close()

There is no need to attach the server name and port to the message, because connect has already established where the bytes go. That is the clearest single contrast with the UDP client, which attaches the destination to every datagram.

Slide 26 gives the practical instructions: save two separate files, one client and one server, use 'localhost' or '127.0.0.1' instead of 'hostname', run the server file first, then run the client file and test performance.`,
      },
    ],
  },
  {
    id: 'mat-ceng-l3',
    courseId: CENG401_COURSE_ID,
    title: 'Lecture 3: Peer-to-Peer Network Architecture',
    kind: 'lecture-notes',
    origin: 'imported',
    attribution: 'Dr. Ali Alnoman, CENG 401, Fall 2026. Lecture 3.pdf, 53 slides.',
    fileName: 'Lecture 3.pdf',
    topicIds: ['ceng-p2p-time', 'ceng-discovery', 'ceng-bittorrent', 'ceng-dht'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-ceng-l3-p2p',
        heading: 'Slides 2 to 4: speeding up distribution, and the P2P model',
        topicIds: ['ceng-p2p-time'],
        text: `How to speed up file distribution? Increase the server upload rate, by adding multiple servers or increasing the link bandwidth at the server. Alternatively, have the clients, the peers, help. Client receivers get a copy of the data and re-distribute it to other clients, which reduces the burden on the server. The slide's example: imagine 1,000 students downloading the same 2-GB lecture video. In client-server architecture, the university server must send 1,000 copies. In P2P, students who already received portions can help distribute those portions to other students.

Peer-to-peer architecture. There is no always-on server. Arbitrary end-systems directly communicate with each other. Peers are intermittently connected, and can change IP addresses. Examples are file distribution with BitTorrent and VoIP with Skype.

The question slide 4 sets up is: how much time is needed to distribute a file of size F from one server to N peers? The variables are F for file size, N for the number of peers, u_s for server upload capacity, u_i for peer i's upload capacity, and d_i for peer i's download capacity. The network itself is assumed to have abundant bandwidth, so the only constraints are at the edges.`,
      },
      {
        id: 'p-ceng-l3-formulas',
        heading: 'Slides 5 to 7: the two distribution-time bounds',
        topicIds: ['ceng-p2p-time'],
        text: `File distribution time, client-server. The server must sequentially send N file copies. The time to send one copy is F/u_s, so the time to send N copies is N*F/u_s. Each client must download a file copy, and d_min is the minimum download rate of the clients, d_min = min(d_1, d_2, ..., d_N), so the maximum download time is F/d_min. The distribution time is bounded below by whichever is larger:

D_CS >= max(N*F/u_s, F/d_min)

The server term increases linearly in N.

File distribution time, P2P. The server must upload at least one copy, taking F/u_s. Each client must download a copy, so the maximum client download time is F/d_min. Collectively the clients must download N*F bits, and the total upload rate available is u_s plus the sum of all u_i. So:

D_P2P >= max(F/u_s, F/d_min, N*F/(u_s + sum(u_i)))

The N*F numerator still increases linearly in N, but so does the denominator, because each peer brings service capacity as well as demand. That third term is what causes the non-linear, reduced curve for P2P.

Both expressions are written with >= in the source. They are lower bounds under the slides' idealized assumptions, not predictions of what a real transfer takes.

Slide 7's example. Assume all clients upload at u_c, F/u_c = 1 hour, u_s = 10*u_c, and d_min >= u_s. For N = 20, the client-server server term is 20*F/(10*u_c) = 2*(F/u_c) = 2 hours. The P2P combined-upload term is 20*F/(10*u_c + 20*u_c) = 0.67 hour. Plotted against N, client-server time grows linearly while P2P time grows far more slowly.`,
      },
      {
        id: 'p-ceng-l3-exercise',
        heading: 'Slides 8 and 9: the worked exercise, one server and seven peers',
        topicIds: ['ceng-p2p-time'],
        text: `The exercise. One server and 7 peers. Distribute a file of size F = 4 Gbits to each of the 7 peers. The server has an upload rate of u_s = 72 Mbps.

The 7 peers have upload rates u_1 to u_7 of 19, 24, 27, 25, 23, 21 and 13 Mbps. Their download rates d_1 to d_7 are 23, 14, 13, 32, 11, 30 and 40 Mbps.

The values that matter are d_min = 11 Mbps, the slowest download, and sum(u_i) = 152 Mbps, so the combined upload capacity is 72 + 152 = 224 Mbps. In the lecture's decimal convention, F = 4000 Mbits and N*F = 28000 Mbits.

Q1. The minimum time using the client-server model is max(N*F/u_s, F/d_min) = max(28000/72, 4000/11) = max(388.89, 363.64) = 388.89 seconds.

Q2. The root cause of that time is the server upload speed, the N*F/u_s term.

Q3. The minimum time using peer-to-peer is max(F/u_s, F/d_min, N*F/(u_s + sum(u_i))) = max(4000/72, 4000/11, 28000/224) = max(55.56, 363.64, 125) = 363.64 seconds.

Q4. The root cause there is the clients' download speed, the F/d_min term.

So the two models are limited by different things. Adding peer upload capacity removed the server bottleneck entirely, and what remains is one peer with an 11 Mbps download that no amount of peer help can speed up. The raw slide rounds two intermediate values to 55.5 and 363.6; the readable supplement carries two decimals throughout.`,
      },
      {
        id: 'p-ceng-l3-discovery',
        heading: 'Slides 10 to 21: Napster, Gnutella and Kazaa',
        topicIds: ['ceng-discovery'],
        text: `Locating the relevant peers. Three main approaches: a central directory, as in Napster; query flooding, as in Gnutella; and a hierarchical overlay, as in Kazaa and modern Gnutella. The design goals are scalability, simplicity, and robustness.

Napster. Version 1.0 and the company both arrived in 1999, along with the first lawsuits; by 2000 there were 80 million users; by mid-2001 it was out of business due to lawsuits, and dozens of decentralized P2P alternatives had appeared.

The Napster directory service. A client contacts Napster and provides a list of the mp3 files it will share, and Napster's central server updates the directory. When a client searches a title, Napster identifies online clients with the file and provides their IP addresses. The client then requests the file from the chosen supplier, the supplier transmits it, and both report status back to the Napster server. The server's directory is continuously updated, so it always knows what is currently available, but that poses a point of vulnerability to legal action. The file transfer itself is peer-to-peer and puts no load on the server. Suppliers are ranked by their apparent bandwidth and response time.

Napster's limitations follow from the central directory: a single point of failure, a performance bottleneck, and copyright infringement exposure. File transfer is decentralized, but locating content is highly centralized. Later P2P systems became more distributed, and Gnutella went to the other extreme.

Gnutella, released in 2000, uses query flooding. To join, contact a few nodes to become neighbors. To search, ask the neighbors, who ask their neighbors, so the query spreads through the overlay. To fetch, get the file directly from the node that has it, which does not retrace every flooded search edge. The advantages are that it is fully decentralized and search is distributed. The disadvantages are that search scope can be quite large and search time quite long, giving high overhead especially when nodes come and go often.

Kazaa, released in 2001, uses a super-node hierarchy. On start, a client contacts a super-node and sends it a list of files. Queries are flooded among super-nodes rather than among all peers. Files are fetched directly from peers. Ordinary peers connect to a group-leader peer, and group leaders connect to each other, in what the legend calls neighboring relationships in the overlay network. The motivation is query consolidation, since fewer queries are needed with super-nodes, and stability, since super-node selection favors nodes with high uptime: how long a peer has been on is a good predictor of how long it will be around in future.`,
      },
      {
        id: 'p-ceng-l3-bittorrent',
        heading: 'Slides 22 to 38: BitTorrent, chunks, choking and free-riding',
        topicIds: ['ceng-bittorrent'],
        text: `BitTorrent puts the emphasis on efficient fetching, not searching: distributing the same file to many peers, where a single publishing client can have many downloaders. It also works to prevent free-loading, where a client receives the file without contributing to distribution, by giving peers incentives to contribute.

The file is divided into 256Kb chunks. A torrent is the group of peers exchanging chunks of a file, and the tracker tracks the peers participating in it. Alice arrives, obtains a list of peers from the tracker, and begins exchanging chunks with peers in the torrent. A given torrent could have fewer than ten, or more than a thousand, peers participating at any instant.

A peer joining a torrent has no chunks but accumulates them over time from other peers. It registers with the tracker to get the list of peer IP addresses and connects to a subset of, say, 50 peers, its neighbors. While downloading, a peer uploads chunks to other peers, and it may change the peers it exchanges with. Churn means peers may come and go: once a peer has the entire file, it may selfishly leave or altruistically remain in the torrent. A peer does not need the complete file before it can upload: peers hold different subsets and pass chunks between each other as well as receiving them from a peer that is complete.

Requesting chunks. At any given time, different peers have different subsets of the file's chunks. Periodically, Alice asks each peer for the list of chunks they have. She requests the missing chunks from her peers rarest first, meaning the chunks with the fewest repeated copies among her neighbors.

Sending chunks. Alice sends chunks to the four peers currently sending her chunks at the highest rate. In BitTorrent lingo those four are unchoked. Other peers are choked by Alice and do not receive chunks from her. The top four are re-evaluated every 10 seconds. Every 30 seconds, Alice randomly selects another peer and starts sending it chunks, which is optimistic unchoking, and that newly chosen peer may join the top four.

The mechanism it builds: Alice optimistically unchokes Bob, Alice becomes one of Bob's top-four providers, Bob reciprocates, and Bob becomes one of Alice's top-four providers. A higher upload rate finds better trading partners, and so gets the file faster.

The tracker is an infrastructure node. It keeps track of the peers participating in the torrent, a peer registers with it on arrival, and it returns a set of peer IP addresses so a new peer knows who to contact for data. A trackerless system is possible using distributed hash tables. The overall architecture runs in sequence: a peer gets the .torrent from a web page linking to it, sends a Get or announce request to the tracker, receives a peer list, handshakes with those peers, receives pieces from them, and sends pieces back while continuing to communicate with the tracker.

Why not download chunks in order, like an HTTP client? Because many peers have the early chunks and few have the end of the file, so peers have little to share with each other, limiting scalability, and eventually nobody has the rare chunks, limiting the ability to complete a download. Rarest chunk first requests the chunk with the fewest available copies. It benefits the peer by avoiding starvation when some peers depart, and benefits the system by avoiding starvation across all peers wanting the file and by balancing load, equalizing the number of copies of each chunk.

Free-riding. The vast majority of users are free-riders: most share no files and answer no queries, and others limit their connections or upload speed. A few peers essentially act as servers, individuals contributing to the public good, which makes them hubs. BitTorrent prevents free riding by allowing the fastest peers to download, while occasionally letting some free loaders download, which is what optimistic unchoking does.`,
      },
      {
        id: 'p-ceng-l3-dht',
        heading: 'Slides 39 to 50: hashing, DHTs and the successor rule',
        topicIds: ['ceng-dht'],
        text: `A simple database holds (key, value) pairs, and the value can be retrieved using the key. In P2P networks the key is an object ID and the value is a peer ID.

A hash function maps data of arbitrary size to data with fixed size, for example 160 bits. The values it returns are hash values. In cryptography a hash produces a fixed-length digest that can be used for integrity checking.

A hash table here is simply a database distributed to peers in a P2P network. It is more convenient to store and search files using the numerical representation of keys. To locate a file, first hash its name to find the corresponding key, then route a locate-object message to find the value, the ID of the peer having the file. So: key = hash(object name) gives an object ID, and value = hash(IP address) gives a peer ID. Both IDs are mapped onto the same ID space, drawn as a circle running from 0 to 2^128 - 1. Since a 128-bit ID space is enormous, it is unlikely that an object will hash to exactly the same ID as a peer's IP address.

A distributed hash table distributes the (key, value) pairs to millions of peers. Any peer can query the database with a key and get the value back. Resolving a query exchanges only a small number of messages among peers, and each peer only knows about a small number of other peers.

Assigning key-value pairs to peers. The rule is to assign a key-value pair to the peer that has the closest ID, and the convention for closest is the immediate successor. Take combined object IDs (keys) {0, 1, 2, 3, ..., 63} and 8 peers with IDs 1, 12, 13, 25, 32, 40, 48, 60. If key = 51, it is assigned to peer 60. If key = 60, it is assigned to peer 60. If key = 11, it is assigned to peer 12. The second example is the one worth noticing: a key that lands exactly on a peer ID stays with that peer, because the successor relation includes equality.

Circular DHT. Each peer is only aware of its immediate successor and predecessor, forming the overlay 1, 12, 13, 25, 32, 40, 48, 60 and back to 1. Resolving a query: peer 12 asks for the value associated with key 53, and the query is forwarded along the successor chain through 13, 25, 32, 40 and 48 to peer 60, which holds it, and the value returns to peer 12. This takes O(N) messages on average with N peers.

Circular DHT with shortcuts. Each peer keeps track of the IP addresses of its predecessor, its successor, and some shortcuts. For the same key 53 the query travels 12 to 32 to 48 to 60, reducing the illustrated lookup from 6 messages to 3. It is possible to design shortcuts with O(log N) neighbors and O(log N) messages per query.`,
      },
      {
        id: 'p-ceng-l3-churn',
        heading: 'Slides 51 to 53: peer churn and blockchain',
        topicIds: ['ceng-dht'],
        text: `Handling peer churn. Peers may come and go. Each peer knows the address of its two successors. Each peer periodically pings its two successors to check aliveness. If the immediate successor leaves, the peer chooses the next successor as its new immediate successor.

The worked example uses a ring of peers 1, 3, 4, 5, 8, 10, 12, 15. If peer 5 abruptly leaves, peer 4 detects peer 5's departure and makes 8 its immediate successor. Peer 4 then asks 8 who its immediate successor is, and makes 8's immediate successor its own second successor. Knowing two successors rather than one is what makes that repair possible without a global rebuild: the replacement is already known before it is needed.

Blockchain networks as P2P architecture. Blockchain networks consist of a collection of distributed peers, or nodes, and nodes communicate directly with other nodes over the P2P network. Since the blockchain is based on a decentralized model, there is no single entity that can approve a transaction. Instead the participating nodes have to reach an agreement, a consensus, to accept and validate a transaction. When a block is formed, the block is sent to all nodes in the network to be validated. Each successive block contains a fingerprint of the previous block, calculated using a hash algorithm: block 2 stores hash #1, block 3 stores hash #2, and so on, so altering an earlier block breaks every link after it.

The lecture's references are Kurose and Ross, Computer Networking: A Top-Down Approach, 8th edition, Pearson 2020, and Peterson and Davie, Computer Networking: A System Approach, Elsevier.`,
      },
    ],
  },
];
