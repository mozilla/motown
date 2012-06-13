#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */



// Module dependencies.
const 
utils             = require('util'),
WebSocketServer   = require('websocket').server,
sio               = require('socket.io'),
uuid              = require('node-uuid'),
createRedisClient = require('../../lib/redis'),
pubsubRedis       = createRedisClient(),
parseCookie       = require('connect').utils.parseCookie,
logger            = require('../../lib/logger'),
config            = require('../../lib/configuration'),
User              = require('../models/user');
mysql             = require('mysql').createClient(config.get('mysql'));

var
connections = {}, // {<userId>: [conn, conn], ...}
socket = null,
io = null;

function sendMessageToUser(userId, message){
  if (userId in connections){
    for (var i in connections[userId]){
      var conn = connections[userId][i];
      conn.sendUTF(message);
    }
  }
}

function broadcast(message){
  if (typeof(message) != 'string'){
    message = JSON.stringify(message);
  }
  for (var userId in connections){
    for (var i in connections[userId]){
      var conn = connections[userId][i];
      conn.sendUTF(message);
    }
  }
}

/*
 * Story Stuff: This should really get rolled up into a model.
 */
function sendStoryToUser(userId, story){
  var message = JSON.stringify({
    topic: 'feed.story',
    data: story
  });

  sendMessageToUser(userId, message);
}

function subscribeForStories(){
  pubsubRedis.on("ready", function(){
    pubsubRedis.subscribe(["feeds.storyForUser", "user.signout", 'contacts.userStatusUpdate', 'contacts.userOffline', 'contacts.reset']);

    pubsubRedis.on("message", function(channel, message){
      switch(channel){
        case "feeds.storyForUser":
          var data = JSON.parse(message);
          sendStoryToUser(data.userId, data.story);

          break;
        case "user.signout":
          var userId = parseInt(message);

          if (userId in connections){
            logger.debug("User #" + message + " signing out. (" + connections[userId].length + " active connections)");

            for (var i in connections[userId]){
              var connection = connections[userId][i];

              connection.sendUTF(JSON.stringify({topic: 'user.signout'}), function(){
                connection.close();
              });
            }
            delete connections[userId];
          }
          break;
        case "contacts.reset":
          broadcast(message);
          break;
        case "contacts.userStatusUpdate":
          broadcast(message);
          break;
        case "contacts.userOffline":
          broadcast(message);
          break;
        default:
          logger.error("Redis message received in socket.js on unexpected channel: " + channel);
      }
    });
  });
}

function sendContactListToUser(userId){
  logger.debug("Sending contact list to user. (id: " + userId + ")");
  mysql.query(
    "SELECT DISTINCT \
      users.id as id, \
      users.real_name as realName, \
      users.nick, \
      CONCAT('http://www.gravatar.com/avatar/', MD5(users.email)) as gravatar, \
      networks.status \
    FROM \
      users \
    INNER JOIN \
      networks \
      ON \
      networks.user_id = users.id \
    WHERE \
      networks.channel in (SELECT channel FROM networks as n2 WHERE n2.user_id = ?) \
      AND \
      networks.user_id <> ?",
    [userId, userId],
    function(err, rows){
      if (err)
        logger.error(err);

      if (rows && rows.length){
        
        for (var i in rows){
          sendMessageToUser(userId, JSON.stringify({
            topic: 'contacts.userStatusUpdate',
            data: {
              id: rows[i].id,
              realName: (rows[i].realName || rows[i].nick),
              gravatar: rows[i].gravatar,
              nick: rows[i].nick,
              status: rows[i].status
            }
          }));
        }
      }
    }
  );
}

function userConnected(user){
  logger.debug("Loading stories for user. (id: " + user.id + ")");
  mysql.query("SELECT * FROM stories where user_id = ? ORDER BY published_at DESC LIMIT 30", [user.id], function(err, rows){
    if (err){
      logger.error("Error loading stories for user: " + user.email);
      logger.error(err);
    }

    logger.debug(parseInt(rows && rows.length) + ' stories found for user.');

    for(var i in rows){
      // To make sure we sen the last one first.
      i = rows.length - i - 1;
      var story = JSON.parse(rows[i].data);
      sendStoryToUser(user.id, story);
    }
  });
  
  var responseQueue = "irc-resp:" + uuid.v1();
  var redis = createRedisClient();
  redis.lpush("irc:user-connected", JSON.stringify([user.id, user.nick, responseQueue]));

  // We block for two minutes max.
  redis.brpop(responseQueue, 120, function(err, data){
    if (!data)
      logger.error("Timeout exceeded waiting for IRC daemon to update user: " + user.id);

    // Even if we get an error, we try to do our magic.
    sendContactListToUser(user.id);
  });
}

module.exports = {
  listen: function(httpd, store){
    
    socket = new WebSocketServer({
      httpServer: httpd,
      autoAcceptConnections: false
    });

    subscribeForStories();

    // This is during the socket upgrade request.
    // We reject for a few reasons mostly around auth
    socket.on('request', function(request){
      if (!request.httpRequest.headers.cookie){
        logger.info('Socket request rejected because it lacked cookie data.');
        return request.reject();
      }

      // here we use parseCookie instead of the already parsed cookies because
      // it puts it in a stupid format:
      // cookies: [ { name: 'express.sid', value: 'cHi8HFKx2C...
      var cookies = parseCookie(request.httpRequest.headers.cookie);

      if (!cookies['express.sid']){
        logger.info('Socket request rejected because it lacked an express.sid (Session)');
        return request.reject();
      }
      var sessionID = cookies['express.sid'];
      store.load(sessionID, function(err, session){
        if (err || !session){
          logger.error('Socket request rejected due to error loading session: ' + err);
          return request.reject();
        }
        else if ( !session.passport || !session.passport.user){
          logger.info('Socket request rejected. -- Passport user empty.');
          return request.reject();
        }
        else{
          var connection = request.accept();

          var user = User.find(session.passport.user, function(err, user){

            connection.userId = user.id;
            connection.email = user.email;
            connection.sessionID = sessionID;

            connection.on("message", function(message){
              message = JSON.parse(message.utf8Data)
              if (message.topic == 'sidebar.refresh'){
                userConnected(user);
              }
              else{
                logger.error("Unhandled message from worker: " + JSON.stringify(message));
              }
            });

            if (!connections[user.id]){
              connections[user.id] = [];
            }

            connections[user.id].push(connection);

            logger.debug(user.email + " connected");

            userConnected(user);

            connection.on('close', function() {
              logger.debug(user.email + " disconnected");
              var userConnections = connections[user.id];
              if (userConnections){
                var previousCount = userConnections.length

                var index = userConnections.indexOf(connection);

                if (~index) {
                  // remove the connection from the pool
                  userConnections.splice(index, 1);
                  if (!userConnections.length){
                    delete connections[connection.user];
                  }
                }
              }
            });
          });
        }
      });
    });
  }
};
