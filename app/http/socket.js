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
logger            = require('winston'),
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

/*
 * Story Stuff: This should really get rolled up into a model.
 */
function sendStoryToUser(story, userId){
  var message = JSON.stringify({
    topic: 'feed.story',
    data: story
  });

  sendMessageToUser(userId, message);
}

function subscribeForStories(){
  pubsubRedis.on("ready", function(){
    pubsubRedis.subscribe("stories");

    pubsubRedis.on("message", function(channel, message){
      if (channel == "stories"){
        var data = JSON.parse(message);
        
        var users = data.userIds;
        for (var i in users){
          if (users[i] in connections){
            sendStoryToUser(data.story, users[i]);
          }
        }
      }
      else{
        logger.error("Redis message received in socket.js on unexpected channel: " + channel);
      }
    });
  });
}

function sendContactListToUser(userId){

  mysql.query(
    "SELECT DISTINCT \
      users.real_name, \
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
      networks.channel in (SELECT channel FROM networks as n2 WHERE n2.user_id = ?)",
      // AND \
      // networks.user_id <> ?"
    [userId],
    function(err, rows){
      if (err)
        logger.error(err);

      if (rows && rows.length){
        var contacts = [];
        for (var i in rows){
          contacts.push({
            realName: rows[i].real_name,
            gravatar: rows[i].gravatar,
            nick: rows[i].nick,
            status: rows[i].status || 'available'  
          });
        }

        sendMessageToUser(userId, JSON.stringify({topic: 'contacts.list', data: contacts}));
      }
    }
  );
}

function userConnected(user){
  //TODO: Switch to using ids for stories
  mysql.query("SELECT * FROM stories where user_id = ? ORDER BY published_at DESC LIMIT 30", [user.id], function(err, rows){
    logger.debug(parseInt(rows || rows.length) + ' stories found for user.');

    for(var i in rows){
      // To make sure we sen the last one first.
      i = rows.length - i - 1;
      var story = JSON.parse(rows[i].data);
      console.log(rows[i].published_at);
      sendStoryToUser(story, user.id);
    }
  });
  
  var responseQueue = "irc-resp:" + uuid.v1();
  var redis = createRedisClient();
  redis.lpush("irc:updateUserStatusFromId", JSON.stringify([user.id, responseQueue]));

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

            if (!connections[user.id]){
              connections[user.id] = [];
            }

            connections[user.id].push(connection);

            logger.debug(user.email + " connected");

            userConnected(user);

            connection.on('close', function() {
              logger.debug(connection.user + " disconnected");
              var userConnections = connections[connection.user];
              var previousCount = userConnections.length

              var index = userConnections.indexOf(connection);

              if (~index) {
                // remove the connection from the pool
                userConnections.splice(index, 1);
                if (!userConnections.length){
                  delete connections[connection.user];
                }
              }
            });
          });
        }
      });
    });
  }
};
