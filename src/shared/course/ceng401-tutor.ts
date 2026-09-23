import type { TopicScript } from './tutor-script.ts';

/**
 * Authored tutor scripts for CENG 401.
 *
 * ── Three topics, not ten ─────────────────────────────────────────────────
 *
 * The tutor is a lookup table of hand-written turns. A script that covers a
 * topic thinly is worse than no script at all, because `topicCapabilities`
 * would then advertise "learn this with the tutor" and deliver a session that
 * runs out of authored content halfway through the arc. So only three topics
 * get one, and they are the three where a student actually gets stuck rather
 * than the three that are easiest to write:
 *
 *   * the distribution-time calculations, where the arithmetic is easy and
 *     choosing the right term is not;
 *   * the socket APIs, where the two-socket structure of a TCP server is the
 *     thing that collapses under pressure;
 *   * the four delay components, where transmission and propagation get
 *     merged into one vague idea of "lag".
 *
 * The other seven topics have materials and questions, so the planner will
 * suggest reading and practice for them and will not offer the tutor. That is
 * the capability check doing its job, and it is the honest outcome.
 *
 * ── The misconception triggers are the real mistakes ──────────────────────
 *
 * Each `misconception.triggers` list is drawn from what the lecture itself
 * flags: writing F/u_s where N*F/u_s belongs, closing the welcoming socket,
 * thinking a longer packet takes longer to propagate. These are the errors the
 * slides spend a sentence warning about, which is a good sign they are the
 * ones students make.
 */

const P2P_TIME: TopicScript = {
  greeting:
    'File distribution time. This is the one where the arithmetic is trivial and the marks are still lost, because the difficulty is not computing the terms, it is knowing which one to take and saying why.',
  fromPassage:
    'You are on the distribution-time material. Let us work it rather than re-read it, because these formulas only stick once you have chosen the limiting term a few times yourself.',
  fromMistake:
    'This came up and the answer did not land. Worth finding out whether the formula was wrong or the choice of term was, because they need different fixes.',
  stages: {
    orient: {
      open: {
        text: 'First, what I am: everything I say here was written in advance for this prototype. I am a scripted tutor, not a live model. I recognise a handful of things you might ask, and I will say so plainly when you say something I have no branch for.\n\nNow. Two formulas, two limiting terms. Do you want to start with where the formulas come from, or go straight to the slide 8 exercise with the seven peers?',
        nextStage: 'understand',
        suggestions: [
          { label: 'Start with the formulas', intent: 'explain' },
          { label: 'Go to the exercise', intent: 'example' },
        ],
      },
    },
    understand: {
      open: {
        text: 'The formulas, then. Both are **lower bounds**, written with >=, under the assumption that the network core has abundant bandwidth. Every constraint lives at an edge.\n\nClient-server:\n\n**D_CS >= max(N*F/u_s, F/d_min)**\n\nThe server sends N separate copies through its own uplink, so N*F/u_s. The slowest client still has to pull one copy down, so F/d_min.\n\nP2P:\n\n**D_P2P >= max(F/u_s, F/d_min, N*F/(u_s + sum(u_i)))**\n\nThe server now uploads at least one copy, so F/u_s with no N. The slowest client is unchanged. And collectively the peers must pull N*F bits using everyone\'s upload capacity combined.',
        nextStage: 'recall',
        source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-formulas' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'Show me the numbers', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler.\n\nIn client-server, the server does all the sending. Seven peers means seven copies out of one uplink. Add peers and that gets linearly worse.\n\nIn P2P, the peers send to each other. The server sends one copy and then the swarm does the rest, and each peer you add brings its own upload capacity along with its demand.\n\nSo: client-server grows linearly with N. P2P grows much more slowly, because the thing that grows is on the bottom of the fraction as well as the top.',
        source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-formulas' },
        suggestions: [
          { label: 'Show me the numbers', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      example: {
        text: 'Slide 8. F = 4 Gbits, N = 7, u_s = 72 Mbps. Peer uploads 19, 24, 27, 25, 23, 21, 13. Peer downloads 23, 14, 13, 32, 11, 30, 40.\n\nPull out the two numbers you actually need: **d_min = 11 Mbps**, the smallest download, and **sum(u_i) = 152 Mbps**, so combined upload is 72 + 152 = **224 Mbps**.\n\nClient-server: max(28000/72, 4000/11) = max(388.89 s, 363.64 s) = **388.89 seconds**, set by the server term.\n\nP2P: max(4000/72, 4000/11, 28000/224) = max(55.56 s, 363.64 s, 125 s) = **363.64 seconds**, set by the slowest download.\n\nNotice what happened. Peer uploads killed the server bottleneck outright, 388.89 down to 55.56. What is left is one peer on an 11 Mbps line, and no amount of peer help fixes that.',
        nextStage: 'recall',
        source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
        suggestions: [
          { label: 'Test me on it', intent: 'check' },
          { label: 'Why do they end up limited by different things?', intent: 'why' },
        ],
      },
      why: {
        text: 'Because the two architectures remove different constraints.\n\nClient-server has exactly two possible bottlenecks: the server pushing N copies, or the slowest peer pulling one. With N = 7 and a 72 Mbps uplink, the server loses that race.\n\nP2P takes the server term and divides its work across every peer. That term drops from 388.89 to 55.56 seconds, and the combined-upload term comes in at 125 seconds. Both are now below 363.64.\n\nSo the constraint that survives is the one neither architecture touches: a single peer with an 11 Mbps download. That is why the exercise asks for the "root cause" in questions 2 and 4 rather than just the number. The number without the term is half an answer.',
        nextStage: 'reason',
        source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
        suggestions: [
          { label: 'Test me on it', intent: 'check' },
          { label: 'Push me harder', intent: 'continue' },
        ],
      },
    },
    recall: {
      open: {
        text: 'From memory, no slides: **write out both bounds.** Client-server and P2P.\n\nWhat I am checking is where the N goes. Type what you have, even partly.',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'I am not sure', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Client-server has two terms, P2P has three.\n\nAsk yourself, for each term: how many copies have to cross this particular bottleneck? The server in client-server sends N copies. The server in P2P sends one. The slowest client, in both, downloads one.',
        suggestions: [{ label: 'I still am not sure', intent: 'answer' }],
      },
      answer: {
        text: '**D_CS >= max(N*F/u_s, F/d_min)**\n\n**D_P2P >= max(F/u_s, F/d_min, N*F/(u_s + sum(u_i)))**\n\nThe N appears three times in total and it is in a different place each time. On the client-server server term, because the server sends N copies. Not on the P2P server term, because it sends one. On the numerator of the P2P combined term, because the peers collectively download N*F bits, with the combined capacity underneath.\n\nAsking is free. But let me set you a harder one, because writing the formula down and knowing which term wins are different skills, and the exercise tests the second.',
        nextStage: 'reason',
        suggestions: [{ label: 'Go on then', intent: 'continue' }],
      },
    },
    reason: {
      open: {
        text: 'Here is the part that separates answers.\n\nTake the slide 8 setup and change one thing: upgrade the 11 Mbps peer to 40 Mbps, everything else the same. **What happens to each bound, and which term limits each now?**',
        source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Work out the new d_min first. It is not 40. Look at what the second-slowest download was.\n\nThen ask, for each architecture, whether the term that was winning is still winning.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'New d_min = **13 Mbps**, the next slowest, so F/d_min = 4000/13 = **307.69 s**.\n\nClient-server: max(388.89, 307.69) = **388.89 s, unchanged**, still the server term. The upgrade did nothing, because the server was the bottleneck and still is.\n\nP2P: max(55.56, 307.69, 125) = **307.69 s**, still the download term, just a faster one.\n\nThe lesson is the useful bit: which term is limiting tells you where spending money helps. Under client-server, upgrading a peer is wasted. Under P2P, it is the only thing that helps at all.',
        nextStage: 'apply',
        source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-exercise' },
        suggestions: [{ label: 'Let me try one', intent: 'continue' }],
      },
      why: {
        text: 'Because a maximum is decided by one term and one term only, and the rest are invisible until that one moves.\n\nThat is why "388.89 seconds" on its own is a weak answer and "388.89 seconds, limited by the server upload term N*F/u_s" is a strong one. The second tells the reader what to change. The first does not.',
        nextStage: 'apply',
        suggestions: [{ label: 'Let me try one', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'Your turn, cold.\n\nF = 2 Gbits, N = 10, u_s = 50 Mbps. Peer uploads total 200 Mbps. The slowest peer download is 25 Mbps.\n\n**Both bounds, and the limiting term for each.** Watch your units.',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: 'F = 2000 Mbits, so N*F = 20000 Mbits. Combined upload is 50 + 200 = 250 Mbps.\n\nThat gives you four numbers to compute: 20000/50, 2000/25, 2000/50 and 20000/250.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Client-server: max(20000/50, 2000/25) = max(**400 s**, 80 s) = **400 seconds**, limited by the server upload term.\n\nP2P: max(2000/50, 2000/25, 20000/250) = max(40 s, 80 s, **80 s**) = **80 seconds**. Here the download term and the combined-upload term tie at 80, so either can be named as limiting, and the honest answer says both are binding.\n\nA five-fold improvement, and that is the shape the slide 7 graph is drawing: client-server climbing linearly, P2P flattening out because added peers bring capacity as well as demand.',
        nextStage: 'reflect',
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'What to take away.\n\nThe arithmetic was never the hard part. Three things are: putting N only where N belongs, taking d_min as the **minimum** download rather than any other summary of those numbers, and naming the limiting term rather than just reporting a number.\n\nThe third is the one that reads as a weak answer in an exam even when the number is right. If you do one thing before the quiz, practise saying "limited by X" out loud after every calculation.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['f/u_s', 'f/us', 'one copy', 'single copy', 'maximum download', 'largest download', 'fastest peer', 'average'],
    correction: {
      text: 'Hold on, let me catch that before it costs you marks.\n\nTwo things go wrong in exactly this spot. **The client-server server term is N*F/u_s, not F/u_s.** F/u_s is the time to send *one* copy, and in client-server the server sends N of them. Drop the N and you have removed the linear growth that is the entire reason P2P exists.\n\nAnd **d_min is the minimum download rate**, the slowest peer. Not the fastest, not the average. In the slide 8 exercise that is 11 Mbps, not 40 and not the mean of the seven.\n\nTry it again with those two fixed.',
      source: { materialId: 'mat-ceng-l3', passageId: 'p-ceng-l3-formulas' },
      suggestions: [
        { label: 'Let me try again', intent: 'check' },
        { label: 'Show me the worked numbers', intent: 'example' },
      ],
    },
  },
  correct: {
    text: 'That is right, and right in the way the exercise wants: you have the term as well as the number.\n\nLet me push somewhere harder, because the formula is clearly not your problem.',
    nextStage: 'reason',
    suggestions: [{ label: 'Go on then', intent: 'continue' }],
  },
  practiceTopicIds: ['ceng-p2p-time', 'ceng-bittorrent'],
};

const SOCKETS: TopicScript = {
  greeting:
    'Socket programming. The code is short enough to read in a minute and still goes wrong under exam conditions, almost always in the same place: the TCP server has two sockets and they do different jobs.',
  fromPassage:
    'You are on the socket code. Let us trace it rather than re-read it. Code you have read feels familiar and code you have traced is code you can reconstruct.',
  fromMistake:
    'This one did not land. Usually that means the call sequence is solid and the two-socket structure is not, or the other way round. Let us find out which.',
  stages: {
    orient: {
      open: {
        text: 'Before anything: I am a scripted tutor. Every line here was written in advance for this prototype, there is no model behind it, and I will tell you when you ask something I have no branch for.\n\nRight. Which is shakier, the UDP pair or the TCP pair? The TCP one has the two-socket trap in it.',
        nextStage: 'understand',
        suggestions: [
          { label: 'Start with UDP', intent: 'explain' },
          { label: 'Go to TCP', intent: 'example' },
        ],
      },
    },
    understand: {
      open: {
        text: 'UDP first, since TCP is easier to see as a contrast.\n\nBoth sides call `socket(AF_INET, SOCK_DGRAM)`. AF_INET is IPv4, SOCK_DGRAM is UDP. The server then calls `bind((\'\', 12000))`, fixing its local port so anything sent to port 12000 at its IP lands on that socket.\n\nThen the loop:\n\n    message, clientAddress = serverSocket.recvfrom(2048)\n    modifiedMessage = message.upper()\n    serverSocket.sendto(modifiedMessage, clientAddress)\n\n`recvfrom` returns **two** things: the data and the sender\'s address. 2048 is the buffer size going in, not something coming back. That returned address is what `sendto` needs, because a UDP socket holds no connection and has no other way to know where the reply goes.\n\nThe client never binds. The OS gives it a port.',
        nextStage: 'recall',
        source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp-code' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'Now show me TCP', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler version.\n\nUDP is postcards. Every one carries the full address, because nothing remembers anything between them. That is why the client passes `(serverName, serverPort)` to every `sendto`, and why the server has to be told who wrote to it before it can write back.\n\nTCP is a phone call. You dial once with `connect`, and after that you just talk: `send` needs no address because the line already goes somewhere.',
        source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-udp-code' },
        suggestions: [
          { label: 'Now show me TCP', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      example: {
        text: 'TCP, and here is the part to get right.\n\n    serverSocket = socket(AF_INET, SOCK_STREAM)\n    serverSocket.bind((\'\', serverPort))\n    serverSocket.listen(1)\n    while 1:\n        connectionSocket, addr = serverSocket.accept()\n        sentence = connectionSocket.recv(1024)\n        connectionSocket.send(sentence.upper())\n        connectionSocket.close()\n\n**There are two sockets and they are not interchangeable.**\n\n`serverSocket` is the welcoming socket. It binds the port, it listens, and it never carries data. It stays open for the life of the server.\n\n`connectionSocket` comes back from `accept()`, fresh, one per client. The conversation happens on it, and it is the one that gets closed at the end of the loop.\n\nAnd notice `recv(1024)` returns bytes only, with no address, because the connection already identifies the other end. That is exactly the thing UDP\'s `recvfrom` had to hand back.',
        nextStage: 'recall',
        source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
        suggestions: [
          { label: 'Test me on it', intent: 'check' },
          { label: 'Why two sockets?', intent: 'why' },
        ],
      },
      why: {
        text: 'Because one socket cannot be in two states at once.\n\nThe welcoming socket\'s job is to sit on port 12000 waiting for *new* connections. A connection socket\'s job is to carry one conversation with one client, identified by the full four-tuple of source IP, source port, destination IP and destination port.\n\nIf the server reused one socket for both, it could serve exactly one client and would have nothing left listening. Slide 22 says it directly: creating a new socket per client is what lets the server talk with multiple clients, and the source port numbers are what tell them apart.\n\nThis is the demultiplexing material showing up in the API. Same fact, two views.',
        nextStage: 'reason',
        source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
        suggestions: [
          { label: 'Test me on it', intent: 'check' },
          { label: 'Push me harder', intent: 'continue' },
        ],
      },
    },
    recall: {
      open: {
        text: 'Slides away. **Give me the TCP server\'s calls in order**, from creating the socket to closing the connection.\n\nPartial is fine. I want to see whether `listen` and `accept` are in the right places.',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'I am not sure', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Five calls before the loop body starts doing anything useful, and two of them are TCP-only.\n\nAsk: what has to be true before a client can even attempt to connect? The port has to be claimed, and the socket has to be willing to accept.',
        suggestions: [{ label: 'I still am not sure', intent: 'answer' }],
      },
      answer: {
        text: '`socket(AF_INET, SOCK_STREAM)`, then `bind`, then `listen`, then in the loop `accept`, `recv`, `send`, `close`.\n\nThe client\'s side is shorter: `socket(AF_INET, SOCK_STREAM)`, `connect`, `send`, `recv`, `close`.\n\nNo penalty for asking. But the order is only half of it, so let me ask you about the sockets themselves, which is where this actually goes wrong.',
        nextStage: 'reason',
        suggestions: [{ label: 'Go on then', intent: 'continue' }],
      },
    },
    reason: {
      open: {
        text: 'Here is the question that finds out whether you understand it or have memorised it.\n\nA server calls `serverSocket.close()` at the end of the loop instead of `connectionSocket.close()`.\n\n**What happens to the first client, and what happens to the second?**',
        source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'The reply to the first client has already been sent by the time `close` runs. So the first client is fine.\n\nNow ask what the loop does next, and what it needs in order to do it.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'The **first client is served normally**. Its reply went out before the close.\n\nThe **second client cannot connect at all**. The welcoming socket is gone, so nothing holds port 12000 and `accept()` has no door to accept through.\n\nAnd note what is *not* broken: the connection socket is left open rather than closed, which leaks it, but that is the lesser problem. The server stopped being a server.\n\nThat is the whole reason the lecture labels `serverSocket` the welcoming socket. The name is the warning.',
        nextStage: 'apply',
        source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
        suggestions: [{ label: 'Let me try one', intent: 'continue' }],
      },
      why: {
        text: 'Because the two sockets have different lifetimes, and the code makes that look like a detail when it is the structure.\n\nWelcoming socket: one per server, lives as long as the server does. Connection socket: one per client, lives as long as that one exchange.\n\nEvery TCP server you ever write has this shape. Get it once and you have it permanently.',
        nextStage: 'apply',
        suggestions: [{ label: 'Let me try one', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'Apply it. A student writes a UDP server and copies the TCP reply line across:\n\n    message, clientAddress = serverSocket.recvfrom(2048)\n    serverSocket.send(message.upper())\n\n**What breaks, and what should that second line be?**',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: 'The first line already handed them something they are not using.\n\nAsk: does this socket know where the reply should go?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'It has no destination. `send` works on a connected socket, and a UDP socket is not connected: nothing has recorded who the other end is.\n\nThe line should be:\n\n    serverSocket.sendto(message.upper(), clientAddress)\n\n`clientAddress` is precisely why `recvfrom` returns two values. The API is telling you the difference between the protocols, if you read it: `recv`/`send` for a connection that knows both ends, `recvfrom`/`sendto` for datagrams that carry the address each time.',
        nextStage: 'reflect',
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'Worth naming what is now solid.\n\nThe call orders, both protocols. The two sockets in a TCP server and which one gets closed. And the pairing that ties it together: `recvfrom`/`sendto` carry addresses because UDP has no connection, `recv`/`send` do not because TCP does.\n\nIf one of those goes soft in a week it will be the second. Trace the close-the-wrong-socket failure once more and it will stay.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['close the server', 'serversocket.close', 'same socket', 'one socket', 'welcoming socket carries', 'accept returns the same'],
    correction: {
      text: 'Stop there, that is the trap this topic is built around.\n\nYou have the two sockets doing one job. They do not. `serverSocket` is the **welcoming socket**: it binds, it listens, it accepts, and it never carries data. `connectionSocket` is what `accept()` returns, one per client, and it is the one that carries the exchange and the one that gets closed.\n\nClose the welcoming socket and your server serves one client and then refuses every other. Try that again with the two kept apart.',
      source: { materialId: 'mat-ceng-l2', passageId: 'p-ceng-l2-tcp-code' },
      suggestions: [
        { label: 'Let me try again', intent: 'check' },
        { label: 'Explain why there are two', intent: 'why' },
      ],
    },
  },
  correct: {
    text: 'Correct, and you kept the two sockets apart, which is the part that usually slips.\n\nLet me take you somewhere harder.',
    nextStage: 'reason',
    suggestions: [{ label: 'Go on then', intent: 'continue' }],
  },
  practiceTopicIds: ['ceng-sockets', 'ceng-transport'],
};

const DELAY: TopicScript = {
  greeting:
    'Delay. Four components, two of which have formulas, and the marks go on keeping transmission and propagation apart. Most people arrive with both merged into one vague idea of "lag".',
  fromPassage:
    'You are on the delay material. Let us do it properly: the formulas are two lines, and the understanding is entirely in what each one does not contain.',
  fromMistake:
    'This one went wrong. Nearly always that is transmission and propagation being treated as the same quantity. Let us check.',
  stages: {
    orient: {
      open: {
        text: 'One thing first: I am a scripted tutor, written in advance for this prototype. No model. I will say so when you ask something I do not have a branch for.\n\nSo, delay. Do you want the four components laid out, or shall we go straight to the two that have formulas, which is where the marks are?',
        nextStage: 'understand',
        suggestions: [
          { label: 'Lay out the four', intent: 'explain' },
          { label: 'Go to the formulas', intent: 'example' },
        ],
      },
    },
    understand: {
      open: {
        text: 'The four, and they add:\n\n**d_nodal = d_proc + d_queue + d_trans + d_prop**\n\n**d_proc**, processing: checking bit errors and working out the output link. Typically microseconds.\n\n**d_queue**, queueing: waiting at the output link for your turn. Depends on how congested the router is, so it is the one that varies wildly.\n\n**d_trans**, transmission: **L/R**, packet length in bits over link rate in bits per second. The time to push the packet onto the wire.\n\n**d_prop**, propagation: **d/s**, link length over propagation speed, about 2 x 10^8 m/sec. The time for a bit to cross the distance.\n\nThe first two are described. The last two are computed, and those are the two that get confused.',
        nextStage: 'recall',
        source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'Give me numbers', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler.\n\nPicture a queue at a toll booth on a long bridge.\n\nProcessing is the booth reading your ticket. Queueing is waiting behind other cars. Transmission is how long your convoy takes to get through the gate, which depends on how many cars you have and how fast the gate works. Propagation is how long it then takes to drive across the bridge, which depends only on the bridge and your speed.\n\nA longer convoy takes longer through the gate. It does not make the bridge longer.',
        source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
        suggestions: [
          { label: 'Give me numbers', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      example: {
        text: 'Numbers. A 12,000-bit packet, a 6 Mbps link, 3,000 km long, s = 2 x 10^8 m/sec.\n\n**d_trans = L/R** = 12,000 / 6,000,000 = 0.002 s = **2 ms**.\n\n**d_prop = d/s** = 3,000,000 / (2 x 10^8) = 0.015 s = **15 ms**.\n\nPropagation dominates here, seven to one. Now double the packet to 24,000 bits: d_trans becomes 4 ms and **d_prop does not move**. There is no L in d/s.\n\nThat immovability is the whole point. If you can say why d_prop did not change, you have the topic.',
        nextStage: 'recall',
        source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
        suggestions: [
          { label: 'Test me on it', intent: 'check' },
          { label: 'Why does the distinction matter?', intent: 'why' },
        ],
      },
      why: {
        text: 'Because it tells you what to fix.\n\nIf transmission delay dominates, a faster link helps: R is in the denominator. If propagation dominates, a faster link does almost nothing, because d/s has no R in it at all. You would need a shorter path, which usually means moving the content, which is what a CDN does and why lecture 1 puts CDNs in the traffic path.\n\nThat is the same shape as the distribution-time material: identify the limiting term, and it tells you where spending helps.',
        nextStage: 'reason',
        source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-cloud-edge' },
        suggestions: [
          { label: 'Test me on it', intent: 'check' },
          { label: 'Push me harder', intent: 'continue' },
        ],
      },
    },
    recall: {
      open: {
        text: 'From memory: **the four components, and formulas for the two that have them.**\n\nType what you can.',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'I am not sure', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Two happen inside the router. Two happen on the way out of it.\n\nOf the two on the way out, one is about the packet and the link rate, the other is about the distance.',
        suggestions: [{ label: 'I still am not sure', intent: 'answer' }],
      },
      answer: {
        text: '**d_nodal = d_proc + d_queue + d_trans + d_prop**.\n\nProcessing and queueing happen in the router, and the lecture describes rather than computes them. Then **d_trans = L/R** and **d_prop = d/s**.\n\nAsking is fine. Now let me give you the one that actually catches people.',
        nextStage: 'reason',
        suggestions: [{ label: 'Go on then', intent: 'continue' }],
      },
    },
    reason: {
      open: {
        text: 'Two links, same 1,000-bit packet.\n\nLink A: 1 Mbps, 10 metres long. Link B: 100 Mbps, 3,000 km long.\n\n**Which has the larger transmission delay, which has the larger propagation delay, and what does that tell you?**',
        source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Compute all four numbers rather than reasoning about which link is "better". The slow short link and the fast long link each win one of the two.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Link A: d_trans = 1000/1,000,000 = **1 ms**. d_prop = 10 / (2 x 10^8) = **0.05 microseconds**, essentially nothing.\n\nLink B: d_trans = 1000/100,000,000 = **0.01 ms**. d_prop = 3,000,000 / (2 x 10^8) = **15 ms**.\n\nSo A has 100 times the transmission delay and B has roughly 300,000 times the propagation delay.\n\nWhat it tells you: **the two are independent**. Neither one predicts the other, and "this link is fast" does not answer a delay question until you know which delay is being asked about.',
        nextStage: 'apply',
        source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
        suggestions: [{ label: 'Let me try one', intent: 'continue' }],
      },
      why: {
        text: 'Because they are built from disjoint quantities. d_trans = L/R uses the packet and the link rate. d_prop = d/s uses the distance and the physics.\n\nNothing appears in both. So there is no rule of thumb converting one into the other, which is exactly why the slide says in so many words that they are different.',
        nextStage: 'apply',
        suggestions: [{ label: 'Let me try one', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'One for you, cold.\n\nA 40,000-bit packet on a 20 Mbps link, 600 km long, s = 2 x 10^8 m/sec.\n\n**Both delays, with units.** Then tell me whether upgrading the link to 100 Mbps would help much.',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: '600 km is 600,000 metres. And for the upgrade question: which of your two numbers contains R?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'd_trans = 40,000 / 20,000,000 = 0.002 s = **2 ms**.\n\nd_prop = 600,000 / (2 x 10^8) = 0.003 s = **3 ms**.\n\nUpgrading to 100 Mbps takes d_trans from 2 ms to 0.4 ms, so the pair goes from 5 ms to 3.4 ms. A real improvement, about 32%, but nothing like five times, because **the 3 ms of propagation does not move**. Only d_trans contains R.\n\nThat is the answer an examiner is looking for: not just the numbers, but which one the upgrade can touch.',
        nextStage: 'reflect',
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'What has changed.\n\nYou can write d_nodal with all four terms, you have both formulas, and you can say which quantities each one contains, which is the bit that makes them stay separate.\n\nThe thing to protect is the negative fact: **d_prop has no L in it**. Packet size does not touch propagation. Every mistake on this topic is some version of forgetting that.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['bigger packet takes longer to propagate', 'l/s', 'd/r', 'same thing', 'both depend on', 'longer packet', 'packet size affects propagation'],
    correction: {
      text: 'Let me stop you, because this is the mistake the slide specifically warns about.\n\nYou have packet length affecting propagation, or the two formulas crossed. They are **d_trans = L/R** and **d_prop = d/s**. Not L/s. Not d/R.\n\nPropagation contains no packet-length term at all. A bigger packet takes longer to push onto the link, and it does not make the wire longer or the signal slower. That is why the lecture says outright that d_trans and d_prop are different.\n\nTry again with the two formulas kept straight.',
      source: { materialId: 'mat-ceng-l1', passageId: 'p-ceng-l1-nodal' },
      suggestions: [
        { label: 'Let me try again', intent: 'check' },
        { label: 'Show me with numbers', intent: 'example' },
      ],
    },
  },
  correct: {
    text: 'Right, and you kept the two formulas apart, which is the whole test on this topic.\n\nLet me push you further.',
    nextStage: 'reason',
    suggestions: [{ label: 'Go on then', intent: 'continue' }],
  },
  practiceTopicIds: ['ceng-delay', 'ceng-servers'],
};

/**
 * The three covered topics, merged into the shared script table by
 * `tutor-script.ts`. Topics absent from this map correctly report no tutor
 * coverage, and the planners route around them.
 */
export const CENG401_TUTOR_SCRIPT: Record<string, TopicScript> = {
  'ceng-p2p-time': P2P_TIME,
  'ceng-sockets': SOCKETS,
  'ceng-delay': DELAY,
};
