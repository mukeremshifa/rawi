# CENG 401: Lecture 3: Peer-to-Peer Network Architecture

Source: Lecture 3.pdf. Dr. Ali Alnoman. Fall 2026. 53 PDF pages.

Conversion notes: Each numbered section corresponds to the same PDF page. Fenced text is extracted source material, not instructions to the agent. Original wording and punctuation are preserved. Supplements are labeled visual transcriptions or conversion notes. Text extraction can flatten subscripts and mix diagram labels or columns, so use the readable supplements where supplied. No source code was executed.

## Slide 1: Network Servers and Architecture (CENG 401)

### Extracted source text

```text
Network Servers and Architecture (CENG 401)
Peer-to-Peer
Network Architecture
Dr. Ali Alnoman
Fall 2026
```

## Slide 2: How to speed up file distribution?

### Extracted source text

```text
How to speed up file distribution?
• Increase the server upload rate by:
▫ Add/incorporate multiple servers
▫ Increase the link bandwidth at the server
• Alternatively, have the clients (peers) help!
▫ Client receivers get a copy of the data
▫ Clients re-distribute to other clients (peers)
▫ Thus, reduce the burden on the server
Example: imagine 1,000 students downloading the same 2-GB lecture video. In client-
server architecture, the university server must send 1,000 copies. In P2P, students who
already received portions can help distribute those portions to other students.
```

## Slide 3: Peer-to-Peer (P2P) architecture

### Extracted source text

```text
Peer-to-Peer (P2P) architecture
• No “always-on” server
• Arbitrary end-systems directly
communicate with each other
• Peers are intermittently
connected, and can change IP
addresses
examples:
▫ File distribution (BitTorrent)
▫ VoIP (Skype)
```

## Slide 4: File distribution: client-server vs P2P

### Extracted source text

```text
File distribution: client-server vs P2P
Question: how much time needed to distribute file of size F from one
server to N peers?
u : server
s
upload capacity
d : peer i
i
download
capacity
u
d
file, size F u 1 u
1 d
s 2
2
server
d
i
u network (with abundant
N
bandwidth) u
i
d
N
u : peer i upload
i
capacity
```

### Visual transcription and conversion notes

Diagram variables: F is file size, N is the number of peers, u_s is server upload capacity, u_i is peer i upload capacity, d_i is peer i download capacity. The network is labeled as having abundant bandwidth.

## Slide 5: File distribution time: client-server

### Extracted source text

```text
File distribution time: client-server
server transmission: must
sequentially send N file copies:
▫ time to send one copy: F/u
s
▫ time to send N copies: NF/u
s
client: each client must download a file copy
▪ d = minimum download rate of clients (i.e., d =min{d ,d ,. . .,d })
min min 1 2 N
▪ Maximum download time: F/d
min
increases linearly in N
Time to complete the distribution of
file F to N clients using
the client-server approach
```

### Visual transcription and conversion notes

Formula from the boxed image:

D_CS >= max(N * F / u_s, F / d_min)

d_min = min(d_1, d_2, ..., d_N). The server must upload N copies, while the slowest client must download one copy. The server term grows linearly with N.

## Slide 6: File distribution time: P2P

### Extracted source text

```text
File distribution time: P2P
server transmission: must upload at
F
u
least one copy s
d
i
▫ time to send one copy: F/u
s network
u
i
client: each client must download a copy
❖
▪ Maximum client download time: F/d
min
clients: collectively must download NF bits
❖
▪ Total upload rate is u +  u
s i
Time to complete the distribution
of file F to N clients using
the P2P approach
increases linearly in N …
… but so does this, as each peer brings service capacity
```

### Visual transcription and conversion notes

Formula from the boxed image:

D_P2P >= max(F / u_s, F / d_min, N * F / (u_s + sum(u_i)))

The server must upload at least one copy, each client must download one copy, and clients collectively download N * F bits using the combined upload capacity of the server and all peers. The formulas on slides 5 and 6 are lower bounds, shown with >= in the source.

## Slide 7: Client-server vs. P2P: example

### Extracted source text

```text
Client-server vs. P2P: example
In this example, assume:
the client upload rate = u , F/u = 1 hour, u = 10u , d ≥ u
c c s c min s
3.5 Client-server:
P2P
e
3 D ≥ max{NF/u ,F/d }
m
Client-Server c-s s, min
i
T
If N=20,
n 2.5
o
i then NF/u = 20F/10u = 2(F/u ) = 2 hours
t
u s c c
b 2
i
r
t
s
P2P:
i D 1.5
m

D ≥ max{F/u ,F/d ,NF/ ( )}
u 1 u + u
m P2P s, min, s i
i
n
i M 0.5
This term causes the non-linearity
(reduced) curve in P2P architecture
0
If N=20,
0 5 10 15 20 25 30 35

N then NF/ (u + u )= 20F/(10u +20u )= 0.67 hour
s i c c
```

### Visual transcription and conversion notes

Readable formula and graph transcription:
- All clients upload at u_c.
- F/u_c = 1 hour, u_s = 10*u_c, d_min >= u_s.
- For N = 20, the client-server server-upload term is 20*F/(10*u_c) = 2 hours.
- For N = 20, the P2P combined-upload term is 20*F/(10*u_c + 20*u_c) = 0.67 hour.
- The graph plots minimum distribution time against N. Client-server time grows linearly. P2P time grows more slowly because each added peer also contributes upload capacity.

## Slide 8: Exercise:

### Extracted source text

```text
Exercise:
A delay comparison between Client-Server and P2P File Distribution
Consider the figure shown which consists of one server and 7 peers:
The problem is to distribute a file of size F = 4 Gbits to each of these 7 peers. Suppose the
server has an upload rate of u = 72 Mbps
The 7 peers have upload rates of: u = 19 Mbps, u = 24
1 2
Mbps, u = 27 Mbps, u = 25 Mbps, u = 23 Mbps, u = 21
3 4 5 6
Mbps, and u = 13 Mbps
7
The 7 peers have download rates of: d = 23 Mbps, d =
1 2
14 Mbps, d = 13 Mbps, d = 32 Mbps, d = 11 Mbps, d =
3 4 5 6
30 Mbps, and d = 40 Mbps
7
```

### Visual transcription and conversion notes

Exercise values, with subscripts restored:
- F = 4 Gbits, N = 7, u_s = 72 Mbps.
- u_1 through u_7 = [19, 24, 27, 25, 23, 21, 13] Mbps.
- d_1 through d_7 = [23, 14, 13, 32, 11, 30, 40] Mbps.

## Slide 9: Q1) What is the minimum time needed to distribute this file from the central server to the 7

### Extracted source text

```text
Q1) What is the minimum time needed to distribute this file from the central server to the 7
peers using the client-server model?
Answer: The minimum time needed to distribute the file = max {NF/u , F/d } =
S min
max{388.89s, 363.6s} = 388.89 seconds
Q2) For the previous question, what is the root cause of this specific minimum time, server
or clients?
Answer: The root cause of the minimum time was the server upload speed (i.e., NF/u )
S
Q3) What is the minimum time needed to distribute this file using peer-to-peer download?
Answer: The minimum time needed to distribute the file = max {F/u , F/d ,
S min
NF/ ( u + u )} = max {55.5s, 363.6s,125s } = 363.64 seconds.
s i
Q4) For question 3, what is the root case of this specific minimum time: the server or the
client or the combined upload of the clients and the server?
Answer: The root cause of the minimum time was the clients download speed (i.e., F/d )
min
```

### Visual transcription and conversion notes

Readable solution, using the lecture's decimal Gbit/Mbit convention:
- d_min = 11 Mbps, sum(u_i) = 152 Mbps, combined upload = 224 Mbps.
- Client-server: max(28000/72, 4000/11) = max(388.89, 363.64) seconds = 388.89 seconds. Server upload is the limiting term.
- P2P: max(4000/72, 4000/11, 28000/224) = max(55.56, 363.64, 125) seconds = 363.64 seconds. The slowest client's download rate is the limiting term.

The raw slide rounds some intermediate values to 55.5 and 363.6. This supplement carries two decimal places consistently.

## Slide 10: Locating the Relevant Peers

### Extracted source text

```text
Locating the Relevant Peers
• Three main approaches
▫ Central directory (Napster)
▫ Query flooding (Gnutella)
▫ Hierarchical overlay (Kazaa, modern Gnutella)
• Design goals
▫ Scalability
▫ Simplicity
▫ Robustness
```

## Slide 11: Peer-to-Peer Networks: Napster

### Extracted source text

```text
Peer-to-Peer Networks: Napster
• Napster history: the rise • Napster history: the fall
▫ 1999: Napster version 1.0 ▫ Mid 2001: out of business due
▫ 1999: company founded to lawsuits
▫ 1999: first lawsuits ▫ Mid 2001: dozens of
decentralized P2P alternatives
▫ 2000: 80 million users
```

## Slide 12: Napster Directory Service

### Extracted source text

```text
Napster Directory Service
• Client contacts Napster
▫ The client provides a list of mp3 files it will share
▫ … and Napster’s central server updates the directory
• Client searches a title
▫ Napster identifies online clients with the file (client supplier)
▫ … and provides their IP addresses
• Client requests the file from the chosen supplier
▫ Supplier transmits the file to the client
▫ Both client and supplier report status to Napster server
```

## Slide 13: Napster Properties

### Extracted source text

```text
Napster Properties
• Server’s directory is continuously updated
▫ Always knows what mp3 file is currently available
▫ But, this poses a point of vulnerability to legal action
• Peer-to-peer file transfer
▫ No load on the server
• Bandwidth
▫ Suppliers are ranked by their apparent bandwidth and response time
```

## Slide 14: Napster: Limitations of the Central Directory

### Extracted source text

```text
Napster: Limitations of the Central Directory
• Single point of failure File transfer is
decentralized, but
• Performance bottleneck
locating content is highly
• Copyright infringement
centralized
• So, later P2P systems became more distributed
▫ Gnutella went to the other extreme…
```

## Slide 15: Peer-to-Peer Networks: Gnutella

### Extracted source text

```text
Peer-to-Peer Networks: Gnutella
• Gnutella history
▫ 2000: Gnutella released
• Query flooding
▫ Join: contact few nodes to become neighbors
▫ Search: ask neighbors
▫ Fetch: get file directly from another node
```

## Slide 16: Gnutella: Search by Flooding

### Extracted source text

```text
Gnutella: Search by Flooding
search
xyz.mp3
xyz.mp3 ?
Flooding
```

### Visual transcription and conversion notes

Diagram description: a peer searches for xyz.mp3 by forwarding the query to its neighbors. Blue arrows show the initial query spreading through the overlay.

## Slide 17: Gnutella: Search by Flooding

### Extracted source text

```text
Gnutella: Search by Flooding
xyz.mp3
xyz.mp3 ?
Flooding
search
```

### Visual transcription and conversion notes

Diagram description: neighbors propagate the xyz.mp3 query to more peers, illustrating flooding beyond the requester's immediate neighbors.

## Slide 18: Gnutella: Search by Flooding

### Extracted source text

```text
Gnutella: Search by Flooding
transfer
```

### Visual transcription and conversion notes

Diagram description: once xyz.mp3 is located, a direct transfer connects the holder and requester. The file transfer does not retrace every flooded search edge.

## Slide 19: Gnutella: Pros and Cons

### Extracted source text

```text
Gnutella: Pros and Cons
• Advantages
▫ Fully decentralized
▫ Search is distributed
• Disadvantages
▫ Search scope can be quite large
▫ Search time can be quite long
▫ As a result, high overhead especially when nodes come and go often
```

## Slide 20: Peer-to-Peer Networks: Kazaa

### Extracted source text

```text
Peer-to-Peer Networks: Kazaa
• Kazaa history
▫ 2001: Kazaa released
• Super-node hierarchy
▫ Join: on start, the client contacts a super-node, and
sends a list of files to its super-node
▫ Search: queries flooded among super-nodes
▫ Fetch: get file directly from peers
ordinary peer
group-leader peer
neighoring relationships
in overlay network
```

### Visual transcription and conversion notes

Diagram description: larger group-leader peers connect to one another. Smaller ordinary peers connect to their local group leader. The legend calls the connecting lines neighboring relationships in the overlay network.

## Slide 21: Kazaa: Motivation for Super-Nodes

### Extracted source text

```text
Kazaa: Motivation for Super-Nodes
• Query consolidation
▫ With super nodes, fewer queries are needed
• Stability
▫ Super-node selection favors nodes with high uptime. In other words, how long
the peer is “ON” is a good predictor of how long the device will be around in the
future
```

## Slide 22: Peer-to-Peer in Modern Networks: BitTorrent

### Extracted source text

```text
Peer-to-Peer in Modern Networks: BitTorrent
• Emphasis on efficient fetching, not searching
▫ Distribute the same file to many peers
▫ For a single publishing client, there can be many downloaders
• Preventing free-loading (i.e., the client receives the file without
contributing to the file distribution process)
▫ Incentives for peers to contribute
```

## Slide 23: P2P file distribution: BitTorrent

### Extracted source text

```text
P2P file distribution: BitTorrent
❖ file divided into 256Kb chunks
❖ peers in torrent send/receive file chunks
tracker: tracks peers torrent: group of peers
participating in the torrent exchanging chunks of a file
Alice arrives …
A given torrent could
… obtains a list have fewer than ten, or
of peers from the tracker more than a thousand
peers participating at any
… and begins exchanging
instant of time
file chunks with the peers in torrent
```

### Visual transcription and conversion notes

Diagram description: Alice arrives, obtains a peer list from the tracker, and begins exchanging file chunks with peers in the torrent. A torrent is the group exchanging chunks of one file. The slide says “256Kb chunks”. That exact unit spelling is preserved, without silently interpreting it as KB or KiB.

## Slide 24: P2P file distribution: BitTorrent

### Extracted source text

```text
P2P file distribution: BitTorrent
Peer joining torrent:
▫ Peer has no chunks, but will
accumulate them over time from other
peers
▫ Peer registers with the tracker to get
the list of peers IP addresses, connects to
subset of , say 50, peers (“neighbors”)
while downloading, peer uploads chunks to other peers
❖
peer may change peers with whom it exchanges chunks
❖
churn: peers may come and go: once the peer has the entire
❖
file, it may (selfishly) leave or (altruistically) remain in torrent
```

## Slide 25: Peers in BitTorrent download from

### Extracted source text

```text
Peers in BitTorrent download from
other peers that may not yet have
the complete file
```

### Visual transcription and conversion notes

Diagram description: peer A has the complete file. Peers B, C, and D each hold only some chunks. Arrows show chunks can pass between those incomplete peers as well as from A. A peer need not have the complete file before uploading chunks.

## Slide 26: BitTorrent: requesting, sending file chunks

### Extracted source text

```text
BitTorrent: requesting, sending file chunks
requesting chunks: sending chunks:
Alice sends chunks to those four peers
at any given time, different peers ❖
❖
currently sending her chunks at highest
have different subsets of file chunks
rate (In BitTorrent lingo, these four peers are
said to be unchoked)
periodically, Alice asks each peer
❖
for the list of chunks that they have ▪ other peers are choked by Alice (do not
receive chunks from her)
Alice requests the missing chunks
❖
▪ re-evaluate top 4 every10 secs
from her peers, rarest first (chunks
that have the fewest repeated every 30 secs: randomly select another
❖
copies among her neighbors) peer, starts sending chunks
▪ “optimistically unchoke” this peer
▪ newly chosen peer may join top 4
```

### Visual transcription and conversion notes

Column reading order:

Requesting chunks:
- Peers have different subsets of chunks.
- Alice periodically asks peers which chunks they have.
- She requests missing chunks rarest first, based on copies among her neighbors.

Sending chunks:
- Alice sends to the four peers currently sending her chunks at the highest rate. These peers are unchoked.
- Other peers are choked and do not receive chunks from her.
- Re-evaluate the top four every 10 seconds.
- Every 30 seconds, randomly select another peer and send it chunks. This is optimistic unchoking. That peer may enter the top four.

## Slide 27: BitTorrent: sending chunks

### Extracted source text

```text
BitTorrent: sending chunks
(1) Alice “optimistically unchokes” Bob
(2) Alice becomes one of Bob’s top-four providers; Bob reciprocates
(3) Bob becomes one of Alice’s top-four providers
Why higher upload rate? To find better
trading partners, thus get the file faster!
```

### Visual transcription and conversion notes

Diagram callout: a high upload rate helps a peer find better trading partners and get the file faster. Alice optimistically unchokes Bob, becomes one of Bob's top-four providers, Bob reciprocates, and Bob becomes one of Alice's top-four providers.

## Slide 28: BitTorrent: Tracker

### Extracted source text

```text
BitTorrent: Tracker
• Infrastructure node
▫ Keeps track of peers participating in the torrent
▫ A peer registers with the tracker when it arrives
• Tracker selects peers for downloading
▫ Returns a set of peer IP addresses
▫ So, the new peer knows who to contact for data
• Can have “trackerless” system
▫ Using distributed hash tables (DHTs)
```

## Slide 29: BitTorrent: Overall Architecture

### Extracted source text

```text
BitTorrent: Overall Architecture
Tracker
Web Server
Web page with
link to .torrent
C
A
B
```

### Visual transcription and conversion notes

Sequence diagram, step 1: peer A obtains the .torrent from a web server whose page links to it.

## Slide 30: BitTorrent: Overall Architecture

### Extracted source text

```text
BitTorrent: Overall Architecture
Tracker
Web Server
Web page with
link to .torrent
C
A
B
```

### Visual transcription and conversion notes

Sequence diagram, step 2: A sends a Get/announce request to the tracker.

## Slide 31: BitTorrent: Overall Architecture

### Extracted source text

```text
BitTorrent: Overall Architecture
Tracker
Web Server
Web page with
link to .torrent
C
A
B
```

### Visual transcription and conversion notes

Sequence diagram, step 3: the tracker returns a peer list to A.

## Slide 32: BitTorrent: Overall Architecture

### Extracted source text

```text
BitTorrent: Overall Architecture
Tracker
Web Server
Web page with
link to .torrent
C
A
B
```

### Visual transcription and conversion notes

Sequence diagram, step 4: A exchanges handshakes with peers B and C.

## Slide 33: BitTorrent: Overall Architecture

### Extracted source text

```text
BitTorrent: Overall Architecture
Tracker
Web Server
Web page with
link to .torrent
C
A
B
```

### Visual transcription and conversion notes

Sequence diagram, step 5: pieces flow from peers B and C to A.

## Slide 34: BitTorrent: Overall Architecture

### Extracted source text

```text
BitTorrent: Overall Architecture
Tracker
Web Server
Web page with
link to .torrent
C
A
B
```

### Visual transcription and conversion notes

Sequence diagram, step 6: A also sends pieces to B while receiving pieces from B and C.

## Slide 35: BitTorrent: Overall Architecture

### Extracted source text

```text
BitTorrent: Overall Architecture
Tracker
Web Server
Web page with
link to .torrent
C
A
B
```

### Visual transcription and conversion notes

Sequence diagram, step 7: A continues piece exchange while communicating with the tracker through Get/announce and peer-list responses.

## Slide 36: BitTorrent: Chunk Request Order

### Extracted source text

```text
BitTorrent: Chunk Request Order
• Which chunks to request?
▫ Could download in order, like an HTTP client does, but…
• Problem: many peers have the early chunks, few peers have the end of
the file
▫ Peers have little to share with each other
▫ Thus, limiting the scalability of the system
• Problem: eventually nobody has the rare chunks
▫ Chunks need the end of the file
▫ Limiting the ability to complete a download
```

## Slide 37: BitTorrent: Rarest Chunk First

### Extracted source text

```text
BitTorrent: Rarest Chunk First
• Which chunks to request first?
▫ The chunk with the fewest available copies (i.e., the rarest chunk first)
• Benefits to the peer
▫ Avoid starvation when some peers depart
• Benefits to the system
▫ Avoid starvation across all peers wanting a file
▫ Balance load by equalizing the number of chunks copies
```

## Slide 38: Free-Riding in P2P Networks

### Extracted source text

```text
Free-Riding in P2P Networks
• Vast majority of users are free-riders
▫ Most users share no files and answer no queries
▫ Other users might limit the number of connections or upload speed
• A few “peers” essentially act as servers
▫ A few individuals contributing to the public good
▫ Making them hubs that basically act as a server
• BitTorrent prevents free riding
▫ Allows the fastest peers to download
▫ Occasionally let some free loaders download
```

## Slide 39: Distributed Hash Table (DHT)

### Extracted source text

```text
Distributed Hash Table (DHT)
• Hash table
• DHT paradigm
• Circular DHT
• Peer churn
```

## Slide 40: Simple Database

### Extracted source text

```text
Simple Database
Simple database with (key, value) pairs:
• The “value” can be retrieved using the “key”
• In P2P networks:
o key: object ID
o value: Peer ID
```

## Slide 41: Hash Function

### Extracted source text

```text
Hash Function
• Hash function is used to map data of arbitrary size to data with fixed size
(e.g., 160 bits)
• The values returned by a hash function are called hash values
• In cryptography, a hash produces a fixed-length digest that can be used for
integrity checking
```

## Slide 42: Hash Table

### Extracted source text

```text
Hash Table
• Hash Table is simply a database that is distributed to peers in P2P
networks
• It is more convenient to store and search files using the numerical
representation of keys
• To locate a file, first hash its name to find the corresponding “key”, and then
route a “locate object message” to find the “value” (ID of the peer having
the object/file)
• Key: hash(object name) →Object ID
Value: hash(IP address) →Peer ID
```

## Slide 43: Distributed Hash Table (DHT)

### Extracted source text

```text
Distributed Hash Table (DHT)
wikipedia.com
```

### Visual transcription and conversion notes

Image transcription: Data -> Hash function -> Key -> Distributed Network (Peers).
- Fox -> DFCD3454.
- The red fox runs across the ice -> 52ED879E.
- The red fox walks across the ice -> 46042841.

The diagram shows hashed keys directing data into a distributed network. Source label: wikipedia.com.

## Slide 44: Both IDs are then

### Extracted source text

```text
Both IDs are then
mapped onto the
same id space
(circle).
Since a 128-bit ID
space is enormous, it
is unlikely that an
object will hash to
exactly the same ID
as a peer’s IP address
```

### Visual transcription and conversion notes

Diagram description: object IDs and node IDs occupy the same circular space, from 0 through 2^128 - 1. Objects and peers usually have different IDs. The caption says objects are maintained at the nearest node in this space. Slide 46 specifies the immediate-successor convention.

## Slide 45: Distributed Hash Table (DHT)

### Extracted source text

```text
Distributed Hash Table (DHT)
• Distribute a database that includes the (key, value) pairs to millions
of peers
• Any peer can query the database with a key
▫ The database returns value for the key
▫ To resolve a query, small number of messages exchanged among peers
• Each peer only knows about a small number of other peers
```

## Slide 46: Assign key-value pairs to peers

### Extracted source text

```text
Assign key-value pairs to peers
• rule: assign key-value pair to the peer that has the closest ID
• convention: closest means the immediate successor
• The “key” represents “file name”, and the “value” represents the peer
who has the information
For example, consider the combined object IDs (keys): {0,1,2,3,…,63},
and suppose 8 peers with peer IDs (values): 1,12,13,25,32,40,48,60
▫ If key = 51, then assigned to peer 60
▫ If key = 60, then assigned to peer 60
▫ If key = 11, then assigned to peer 12
```

## Slide 47: Circular DHT

### Extracted source text

```text
Circular DHT
Each peer only aware of immediate
successor and predecessor
1
12
60
13
48
25
40
“overlay network”
32
```

### Visual transcription and conversion notes

Circular overlay order: 1 -> 12 -> 13 -> 25 -> 32 -> 40 -> 48 -> 60 -> 1. Each peer knows its immediate predecessor and successor. The accompanying physical-network picture illustrates that this circle is an overlay.

## Slide 48: Resolving a query

### Extracted source text

```text
Resolving a query
What is the value
1
associated with key 53 ?
value
12
60
13
48
25
O(N) messages
on avgerage to resolve
40
query, when there
32
are N peers
```

### Visual transcription and conversion notes

Diagram description: peer 12 asks for the value associated with key 53. The successor chain forwards the query through 13, 25, 32, 40, and 48 to peer 60. The value returns to peer 12. The slide labels lookup as O(N) messages on average for N peers.

## Slide 49: Circular DHT with shortcuts

### Extracted source text

```text
Circular DHT with shortcuts
1 What is the value for
value
key 53
12
60
13
48
25
40
32
• Each peer keeps track of IP addresses of predecessor, successor, shortcuts
• Reduced from 6 to 3 messages
• Possible to design shortcuts with O(log N) neighbors, O(log N) messages in query
```

### Visual transcription and conversion notes

Diagram description: shortcuts reduce the illustrated query for key 53 from six forward messages to three, along 12 -> 32 -> 48 -> 60. Each peer knows predecessor, successor, and shortcuts. The slide states that shortcuts can be designed with O(log N) neighbors and O(log N) query messages.

## Slide 50: More explanation:

### Extracted source text

```text
More explanation:
Immediate successor peer
ID (value) that has the file
• If we could control how objects get
distributed over the network, we might be
able to do a better job of finding those
objects at a later time. Remember:
▫ hash(object name) → Object ID
▫ hash(IP addr) →Peer ID
▫ Both IDs are mapped onto the same id space
(circle)
• How does a user that wants to access
object “x” know which peer is closest in this
space?
Figure: “locate(d46a1c)” message is
▫ route a message to this node using the object key
routed to other peers
```

### Visual transcription and conversion notes

Diagram description: a locate(d46a1c) request is routed around the ID space to the immediate-successor peer. Object keys come from hashing object names. Peer IDs come from hashing IP addresses. Both occupy the same circular space.

## Slide 51: Peer churn

### Extracted source text

```text
Peer churn
Handling peer churn:
1
Peers may come and go (churn)
❖
Each peer knows address of its two
3 ❖
15
successors
4 Each peer periodically pings its
❖
two successors to check aliveness
12
5
If immediate successor leaves, choose
❖
next successor as new immediate
10
8 successor
Example: if peer 5 abruptly leaves
• Peer 4 detects peer 5’s departure; makes 8 its immediate successor
• 4 asks 8 who its immediate successor is; makes 8’s immediate successor its
second successor
```

### Visual transcription and conversion notes

Diagram description: peer 5 leaves a ring containing peers 1, 3, 4, 5, 8, 10, 12, and 15. Peer 4 detects the departure and promotes peer 8 to immediate successor. Peer 4 asks peer 8 for its successor, making that peer its second successor.

## Slide 52: Blockchain Networks as P2P Architecture

### Extracted source text

```text
Blockchain Networks as P2P Architecture
• Blockchain networks consist of a collection of distributed peers (nodes)
• Nodes communicate directly with other nodes over the P2P network
• Since the blockchain is based on a decentralized model, there is no single entity that
can approve a transaction. Instead, the participating nodes have to reach an
agreement (consensus) to accept and validate a transaction
• When a block is formed, the block will be sent to all nodes in the network to be
validated. Each successive block contains a fingerprint of the previous block
calculated using a hash algorithm
```

### Visual transcription and conversion notes

Blockchain diagram: block 1 has Hash #1 and previous hash 0. Block 2 has Hash #2 and previous hash #1. Block 3 has Hash #3 and previous hash #2. Block 4 has Hash #4 and previous hash #3. Each successive block links to the preceding block's hash.

## Slide 53: References:

### Extracted source text

```text
References:
Computer Networking: A Top-Down Approach
8th edition Jim Kurose, Keith Ross, Pearson, 2020
Computer Networking: A System Approach
Larry Peterson and Bruce Davie, Elsevier
```
