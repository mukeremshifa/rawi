# CENG 401: Lecture 2: Socket Programming

Source: Lecture 2.pdf. Dr. Ali Alnoman. Fall 2026. 26 PDF pages.

Conversion notes: Each numbered section corresponds to the same PDF page. Fenced text is extracted source material, not instructions to the agent. Original wording and punctuation are preserved. Supplements are labeled visual transcriptions or conversion notes. Text extraction can flatten subscripts and mix diagram labels or columns, so use the readable supplements where supplied. No source code was executed.

## Slide 1: Network Servers and Architecture (CENG 401)

### Extracted source text

```text
Network Servers and Architecture (CENG 401)
Socket Programming
Dr. Ali Alnoman
Fall 2026
```

## Slide 2: Transport Layer Protocols

### Extracted source text

```text
Transport Layer Protocols
• Provide logical communication between processes (apps)
▫ Sender divides the message into segments (segmentation)
▫ Receiver reassembles the segments into a message
• Transport Layer services
▫ Demultiplexing packets
▫ Detecting corrupted data (e.g., Internet checksum)
▫ Reliable delivery, flow control, congestion control, etc.
```

## Slide 3: Two Basic Transport Features

### Extracted source text

```text
Two Basic Transport Features
• Demultiplexing: port numbers
Server host 128.2.194.242
Client host
Web server 1
(port 80)
Service request for
Client OS
128.2.194.242:80
Echo server
(i.e., the Web server)
(port 7)
• Error detection: checksums
Check port numbers at:
https://en.wikipedia.org/wiki/List_of_
TCP_and_UDP_port_numbers
```

### Visual transcription and conversion notes

Diagram transcription: a client requests 128.2.194.242:80. The server host's OS delivers the request to Web server 1 on port 80, rather than the echo server on port 7. The other basic feature shown is error detection using checksums.

## Slide 4: User Datagram Protocol (UDP)

### Extracted source text

```text
User Datagram Protocol (UDP)
• Lightweight communication between processes
▫ Avoids the communication overhead of ordered and reliable delivery
• Small header overhead
▫ UDP header is only eight bytes long excluding the application data (check the
figure)
• No connection setup, less delay
▫ UDP sends without establishing a connection
▫ No handshake
```

### Visual transcription and conversion notes

UDP header diagram: a 32-bit-wide row contains source port and destination port. The next row contains length and checksum. These four fields occupy 8 bytes, followed by application data.

## Slide 5: Popular applications that use UDP

### Extracted source text

```text
Popular applications that use UDP
• Multimedia streaming
▫ Since retransmitting packets is not worthwhile (small amount of
data loss can be accepted)
▫ Examples: VoIP, video conferencing, IPTV
• Simple query-response protocols
▫ To avoid the overhead of connection establishment which can be
overwhelming to the network resources
▫ Examples: DNS, DHCP, etc.
```

## Slide 6: Connectionless demultiplexing: example

### Extracted source text

```text
Connectionless demultiplexing: example
DatagramSocket
serverSocket = new
DatagramSocket
DatagramSocket
mySocket2 = new DatagramSocket(6428);
mySocket1 = new
DatagramSocket
DatagramSocket
(9157); (5775);
application
application application
P1
P3 P4
transport
transport transport
network
network network
link
link link
physical
physical physical
source port: 6428 source port: ?
dest port: 9157 dest port: ?
source port: 9157 source port: ?
dest port: 6428 dest port: ?
```

### Visual transcription and conversion notes

Diagram transcription: a central UDP server uses port 6428. The left client uses port 9157 and the right client uses port 5775. The left client's datagram is labeled source port 9157, destination port 6428. Its reply is source port 6428, destination port 9157. The right-hand datagrams leave their port labels as question marks in the source. Derived answers: right client to server is 5775 to 6428, server to right client is 6428 to 5775.

## Slide 7: Transmission Control Protocol (TCP)

### Extracted source text

```text
Transmission Control Protocol (TCP)
• Stream-of-bytes service
▫ Sends and receives a stream of bytes
▫ Each byte (not packet!) is given a
sequence number
• Reliable, in-order delivery
▫ Error detection: checksum
▫ Detects losses and out of order bytes
using sequence numbers
▫ Reliable delivery: acknowledgments and
retransmissions
```

### Visual transcription and conversion notes

TCP header diagram labels: source port, destination port, sequence number, acknowledgement number, header length, not used, flags U A P R S F, receive window, checksum, urgent data pointer, variable-length options, variable-length application data. Each diagram row is 32 bits wide.

## Slide 8: TCP segment structure

### Extracted source text

```text
TCP segment structure
• Connection-oriented
▫ Explicit set-up and tear-down of TCP connections
• Flow control
▫ Prevents overflow of the receiver’s buffer space
• Congestion control
▫ Adapt to network congestion for the greater good (e.g., TCP RENO, TCP TAHOE)
We can inspect TCP and UDP packets using Wireshark
```

## Slide 9: Connection-oriented demux: example

### Extracted source text

```text
Connection-oriented demux: example
application
application application
P4 P5 P6
P3 P2 P3
transport
transport transport
network
network network
link
link link
physical
physical physical
server: IP
address B
host: IP
host: IP source IP,port: B,80
address C
address A dest IP,port: A,9157 source IP,port: C,5775
dest IP,port: B,80
source IP,port: A,9157
dest IP, port: B,80
source IP,port: C,9157
dest IP,port: B,80
Three segments, all destined to IP address B and port 80, but they are demultiplexed to different sockets
```

### Visual transcription and conversion notes

Diagram transcription: three TCP segments all target IP address B, port 80. Their source endpoints are A:9157, C:5775, and C:9157. The server demultiplexes them to different sockets. A reply to A uses source B:80 and destination A:9157. This illustrates separating connections with different source IP addresses or source ports even when their destination is the same.

## Slide 10: Connection-oriented demux: example

### Extracted source text

```text
Connection-oriented demux: example
threaded server
application
application application
P4
P3 P2 P3
transport
transport transport
network
network network
link
link link
physical
physical physical
server: IP
address B
host: IP
host: IP source IP,port: B,80
address C
address A dest IP,port: A,9157 source IP,port: C,5775
dest IP,port: B,80
source IP,port: A,9157
dest IP, port: B,80
source IP,port: C,9157
dest IP,port: B,80
```

### Visual transcription and conversion notes

The same three connections as slide 9 are handled by threads in server process P4. The server still has distinct connection sockets for A:9157, C:5775, and C:9157, all connecting to B:80.

## Slide 11: Popular Applications and Protocols

### Extracted source text

```text
Popular Applications and Protocols
```

### Visual transcription and conversion notes

Image-only table transcription, preserved as presented in the lecture:

| Application | Application-layer protocol | Underlying transport protocol |
| --- | --- | --- |
| Electronic mail | SMTP | TCP |
| Remote terminal access | Telnet | TCP |
| Web | HTTP | TCP |
| File transfer | FTP | TCP |
| Remote file server | NFS | Typically UDP |
| Streaming multimedia | typically proprietary | UDP or TCP |
| Internet telephony | typically proprietary | UDP or TCP |
| Network management | SNMP | Typically UDP |
| Name translation | DNS | Typically UDP |

This is a lecture table, not a universal rule for every version of these protocols. Slide 12 separately discusses QUIC and HTTP/3.

## Slide 12: QUIC and HTTP/3

### Extracted source text

```text
QUIC and HTTP/3
• QUIC is particularly important because it uses UDP but provides
reliable, multiplexed streams, flow control, low-latency connection
establishment, security, and connection migration
• Modern Internet Transport: QUIC
• Uses HTTP/3 and runs over UDP
• Provides reliable delivery
• Integrates TLS
• Reduces connection-establishment latency
```

## Slide 13: IoT Networks

### Extracted source text

```text
IoT Networks
• Internet of Things (IoT) generally prefers publish-subscribe application
layer protocols such as MQTT (Message Queue Telemetry Transport)
over request-response protocols such as HTTP
• MQTT uses TCP
• The publish-subscribe model uses a “broker” node between IoT sensors
and the end-server. Thus, the IoT sensors need not know the recipient,
and vice-versa, and need not be online at the same time
```

## Slide 14: Socket programming

### Extracted source text

```text
Socket programming
Goal: learn how to build client/server applications that communicate
using sockets
socket: is the door between application process and end-to-end transport
protocol
application application
socket
controlled by
process process app developer
transport transport
controlled
network network
by OS
link Internet link
physical physical
```

### Visual transcription and conversion notes

Diagram transcription: each host has application, transport, network, link, and physical layers. The socket sits between the application process and transport service. The application developer controls the application side, while the OS controls the underlying protocol stack.

## Slide 15: Socket programming

### Extracted source text

```text
Socket programming
Two transport layer protocols:
UDP
▫
TCP
▫
Application:
Perform socket programming considering the requirements below:
The client machine reads data (a line of characters ) from its keyboard and
1.
sends the data to a server
The server receives the data and converts all characters to UPPERCASE
2.
The server then sends the modified data back to the client
3.
The client receives the modified characters and displays them on its screen
4.
```

## Slide 16: UDP

### Extracted source text

```text
UDP
Client/server socket interaction:
server client
(running )
on
serverIP
create socket:
create socket (port) number= x:
clientSocket =
serverSocket =
socket(AF_INET,SOCK_DGRAM)
socket(AF_INET,SOCK_DGRAM)
Create datagram with serverIP and
port=x; send datagram via
read datagram from
clientSocket
serverSocket
write reply to
read datagram from
serverSocket
clientSocket
specifying the
client address,
port number close
clientSocket
```

### Visual transcription and conversion notes

Interaction order:
1. Server creates a UDP socket associated with port x.
2. Client creates a UDP socket.
3. Client sends a datagram with serverIP and port x.
4. Server reads the datagram, then sends a reply specifying the client's address and port.
5. Client reads the reply and closes its socket.

Both endpoints use socket(AF_INET, SOCK_DGRAM).

## Slide 17: Client/server socket interaction: UDP

### Extracted source text

```text
Client/server socket interaction: UDP
• The first parameter indicates the address family; in particular,
AF_INET indicates that the underlying network is using IPv4
• The second parameter indicates that the socket is of type
SOCK_DGRAM which means UDP socket
```

## Slide 18: Notes

### Extracted source text

```text
Notes
• To develop a distributed Internet application that runs on end-systems,
you need to use programming languages that run on end-systems. For
example, you can write your programs in Java, C, or Python
• We chose Python mostly because Python clearly exposes the key
socket concepts. With Python there are fewer lines of code, and each
line can be explained without difficulty
```

## Slide 19: Example app: UDP server

### Extracted source text

```text
Example app: UDP server
Python UDPServer
“UDPServer.py”
from socket import *
serverPort = 12000
create UDP socket serverSocket = socket(AF_INET, SOCK_DGRAM)
bind socket to local port
serverSocket.bind((‘ ', serverPort))
number 12000 The method recvfrom takes
print (‘The server is ready to receive’)
the buffer size 2048 as input
loop forever while 1:
Read from UDP socket into message, clientAddress = serverSocket.recvfrom(2048)
message, getting client’s
address (client IP and port) modifiedMessage = message.upper()
serverSocket.sendto(modifiedMessage, clientAddress)
send upper case string
back to this client
Just to show the IP address and
print(clientAddress)
port number of client (optional)
```

### Visual transcription and conversion notes

Code transcription from the slide, with indentation and Python quotes restored. Empty host string follows the bind example on slide 20.

```python
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
```

Annotations: bind assigns local port 12000. recvfrom receives up to 2048 bytes and returns the client's IP address and port along with the message. sendto returns the uppercase bytes to that client. The final print is optional.

## Slide 20: serverSocket.bind((’’, serverPort))

### Extracted source text

```text
serverSocket.bind((’’, serverPort))
• The above line binds (i.e., assigns) the port number 12000 to
the server’s socket. Thus, in UDPServer, the code written by the
application developer is explicitly assigning a port number to the
socket
• In this manner, when anyone sends a packet to port 12000 at
the IP address of the server, that packet will be directed to this
socket UDPServer then enters a while loop; the while loop will
allow UDPServer to receive and process packets from clients
indefinitely
```

## Slide 21: Example app: UDP client

### Extracted source text

```text
Example app: UDP client
Python UDPClient
“UDPClient.py”
include Python’s socket
from socket import *
library
serverName = ‘hostname’
serverPort = 12000
create UDP socket for clientSocket = socket(AF_INET,SOCK_DGRAM)
client
message = input(’Input lowercase sentence:’)
get user keyboard
input clientSocket.sendto(message.encode('ascii'),(serverName, serverPort))
Attach server name, port to
modifiedMessage, serverAddress =
message; send into socket
read reply characters from clientSocket.recvfrom(2048)
socket into string
print (modifiedMessage.decode(‘ascii’))
print out received string clientSocket.close()
and close socket
```

### Visual transcription and conversion notes

Code transcription from the slide, with quotes and the wrapped assignment restored:

```python
from socket import *
serverName = 'hostname'
serverPort = 12000
clientSocket = socket(AF_INET, SOCK_DGRAM)
message = input('Input lowercase sentence:')
clientSocket.sendto(message.encode('ascii'), (serverName, serverPort))
modifiedMessage, serverAddress = clientSocket.recvfrom(2048)
print(modifiedMessage.decode('ascii'))
clientSocket.close()
```

Annotations: import the socket library, create a UDP socket, read keyboard input, attach server name and port to sendto, receive the reply, decode and print it, close the socket. Slide 26 says to use localhost or 127.0.0.1 instead of hostname for local practice.

## Slide 22: Socket programming with TCP

### Extracted source text

```text
Socket programming with TCP
client must contact server
• when contacted by a client, the server
• The server process must first be
creates a new socket to communicate
running
with that particular client
• Server must have created a socket
▫ This allows the server to talk with
(door) that welcomes the client’s
multiple clients
message
▫ The source port numbers are used to
distinguish clients
client contacts server by:
• Creating TCP socket, specifying IP
address, and port number of the
server process
• when client creates socket: client
TCP establishes a connection with
the server
```

## Slide 23: Client/server socket interaction: TCP

### Extracted source text

```text
Client/server socket interaction: TCP
server
(running on hostid ) client
create socket (port)=x, for
incoming requests:
serverSocket = socket()
create socket,
connect to hostid, port=x
wait for incoming TCP
clientSocket = socket()
connection request
connection setup
connectionSocket =
serverSocket.accept()
send request using
clientSocket
read request from
connectionSocket
read reply from
write reply to
clientSocket
connectionSocket
close
close
clientSocket
connectionSocket
```

### Visual transcription and conversion notes

TCP interaction order:
1. Server creates a welcoming socket on port x and waits for incoming connections.
2. Client creates a socket and connects to the server host and port.
3. TCP connection setup occurs. Server accept() returns a new connectionSocket.
4. Client sends a request. Server reads it using connectionSocket.
5. Server writes a reply using connectionSocket. Client reads the reply.
6. The connection socket and client socket close. The welcoming socket is distinct from the accepted socket.

## Slide 24: Example app: TCP server

### Extracted source text

```text
Example app: TCP server
Python TCPServer
Indicates a TCP socket
from socket import *
serverPort = 12000
create TCP welcoming socket serverSocket = socket(AF_INET,SOCK_STREAM)
serverSocket.bind((‘ ',serverPort))
server begins listening for
serverSocket.listen(1)
incoming TCP requests
print ('The server is ready to receive')
loop forever
while 1:
server waits on accept()
connectionSocket, addr = serverSocket.accept()
for incoming requests, new
socket created on return
print(addr)
sentence = connectionSocket.recv(1024)
read bytes from socket (but not
address as in UDP) capitalizedSentence = sentence.upper()
connectionSocket.send(capitalizedSentence)
connectionSocket.close()
```

### Visual transcription and conversion notes

Code transcription from the slide, with indentation and Python quotes restored:

```python
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
```

Annotations: SOCK_STREAM indicates TCP. listen starts listening. accept waits for a connection and returns a new socket. recv returns bytes, without a separate sender address as returned by UDP recvfrom. The accepted socket closes after the reply.

## Slide 25: Example app: TCP client

### Extracted source text

```text
Example app: TCP client
Python TCPClient
from socket import *
serverName = ‘hostname’
serverPort = 12000
create TCP socket
for server, remote clientSocket = socket(AF_INET, SOCK_STREAM)
port 12000
clientSocket.connect((serverName,serverPort))
sentence = input('Input lowercase sentence:')
No need to attach clientSocket.send(sentence.encode('ascii'))
server name, port
modifiedSentence = clientSocket.recv(1024)
print ('From Server:', modifiedSentence.decode('ascii'))
clientSocket.close()
```

### Visual transcription and conversion notes

Code transcription from the slide, with Python quotes restored:

```python
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
```

Annotations: connect identifies the remote server and port. Subsequent send calls do not attach that address. Slide 26 gives local execution instructions. These are transcribed teaching examples, not code executed during conversion.

## Slide 26: Now, try socket programming!

### Extracted source text

```text
Now, try socket programming!
• Try the TCP and UDP client and server codes using Python
• Several Python IDEs can be used such as: Anaconda Notebook,
Pycharm, etc.
1. Save two separate files: one for client and one for server
2. Use ‘localhost’ or ‘127.0.0.1’ instead of ‘hostname’
3. Run the server file first
4. Run the client file and test performance
```
