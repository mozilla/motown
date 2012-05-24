# Welcome to MoTown

## MoTown Runtime

MoTown consists of four primary services. Each of these services can be 
run independantly as they communicate through a combination of Redis
queues, published Redis events and MySQL.

### IRC Daemon

The IRC Daemon connects to irc.mozilla.org tracks the NICK changes of 
registered MoTown users and provides WHOIS lookups for other services.

#### API

The IRC Daemon listens on a couple queues in Redis to service requests.

##### irc:whois (nick, responseQueue)

This performs a whois lookup on irc.mozilla.org and returns the results 
to the specified Redis queue.

<pre>
redis> lpush irc:whois "[\"wex\", \"irc-resp:1\"]"

redis> lpop irc-resp:1
"{\"nick\":\"wex\",\"user\":\"simon\",\"host\":\"moz-A6711922.bchsia.telus.net\",\"realname\":\"Simon Wex\",\"channels\":[\"#motown\",\"#b2g\",\"#vancouver\",\"#webdev\",\"#webpagemaker\",\"#socialdev\",\"#identity\",\"#learning\",\"#openwebapps\",\"#labs\"],\"server\":\"concrete.mozilla.org\",\"serverinfo\":\"Phoenix, Arizona, USA\",\"idle\":\"2763\"}"
</pre>

##### irc:updateUserStatusFromId (user.id, responseQueue)

Updates mysql networks table with the user's current membership and status.

###### user.id

The id of the user in the MySQL users table.

<pre>
redis> lpush irc:updateUserStatusFromId "[13, \"irc-resp:2\"]"
(integer) 1

redis> lpop irc-resp:2
"{\"error\":null,\"response\":\"OK\"}"
</pre>

<pre>
mysql> select channel, status from networks where user_id = 13;
+---------------+--------+
| channel       | status |
+---------------+--------+
| #b2g          | NULL   |
| #identity     | NULL   |
| #labs         | NULL   |
| #learning     | NULL   |
| #motown       | NULL   |
| #openwebapps  | NULL   |
| #socialdev    | NULL   |
| #vancouver    | NULL   |
| #webdev       | NULL   |
| #webpagemaker | NULL   |
+---------------+--------+
</pre>


### RSS Daemon

This daemon scrapes specified RSS and Atom feeds and generates "stories"
which are put on the "stories" Redis queue for the Serializer to pick up.

### Serializer

Definitely accepting name suggestions for this one. The Serializer takes 
stories added to a Redis queue, saves them to MySQL and publishes a "stories"
event to redis. This is currently subscribed to by app/http/socket.js which 
communicates with the social worker.

### HTTPD

This hosts the express web engine that provides content for the website and 
social sidebar as well as the socket server.

## TODOS:

