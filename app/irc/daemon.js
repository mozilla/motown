#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
 
const
Url = require('url');

var
config      = require('../../lib/configuration'),
logger      = require('winston'),
irc         = require('irc'),
uuid        = require('node-uuid'),
mysql       = require('mysql').createClient(config.get('mysql')),
redis       = require('../../lib/redis')(),
workerRedis = require('../../lib/redis')();

require('../../lib/extensions/number');

var idsByNick = {}; // {<user.nick>: <user.id>, ...}
var aliases = {}; // {user.nick: "<nick|withstatus>", ...}
var channels = {}; // {'#channel': [<user.id>, ...], ...}

/*
 * Here's what we do on startup:
 *  - Connect to IRC server
 *  - Wait for registration
 *  - Get all the nicks we care about from our user table
 *  - For each User:
 *    - WHOIS user.nick
 *      - For each channel
 *        - Join chan
 *        - REPLACE INTO networks
 *  - DELETE from networks where bot_instance_id <> <BOT_INSTANCE_ID>
 *    (This makes sure that old cached info is destroyed after a restart)
 *  - If we don't find an online user, we'll never be alerted to a user being online 
 *    (no join messages when you're not in any chans) 
 *
 * One thing this doesn't accomplish yet is filling the aliases list off the bat.
 * We can only get WHO *|* results for users in the same rooms as us, we'll have 
 * to deal with this later.
 */

 //TOOD: Figure out a better way to bootstrap. -- Currently, I'm just making sure I join #motown

var bot = new irc.Client('irc.mozilla.org', 'motown', {
  debug: false,
  userName: 'motown',
  realName: 'Non-archiving MoTown bot',
  channels: ['#motown']
});

bot.addListener('error', function(error){
  console.log(error);
});

function bootstrap(){
  mysql.query(
    "SELECT id, nick FROM users WHERE nick is not null",
    function(err, rows){
      if (!err){
        for(var i in rows){
          var row = rows[i];

          idsByNick[row.nick] = row.id;
          console.log("updating user " + row.nick);
          updateUserStatus(row.nick);          
        }
      }
      else{
        logger.error("Error retrieving nicks from users table.");
        logger.error(err);
        process.exit(1);
      }
    }
  );
}

bot.addListener("registered", bootstrap);

bot.addListener('join', function(channel, who) {
  var parts = parseStatus(who);
  var nick = parts[0];
  var status = parts[1];

  if (status){
    aliases[nick] = who;
  }


  if (nick in idsByNick){
    // User has just joined another channel
    bot.join(channel);
    insertNetworkUpdate(channel, idsByNick[nick], status, null);
  }
  else{
    mysql.query("SELECT id FROM users where nick = ?", [nick], function(err, rows){
      if (rows.legnth > 0){
        idsByNick[nick] = rows[0].id;
        insertNetworkUpdate(channel, rows[0].id, status, null);

        // This is to help with bootstrapping:
        updateUserStatus(nick);
      }
      // Otherwise we don't care, it's not someone who's part of motown.
    });
  }

  console.log('%s has joined %s', who, channel);
});

function userLeftChannel(channel, who){
  logger.debug("User " + who + " left " + channel);
  var nick = parseStatus(who)[0];

  // We only care if they're in motown
  if (nick in idsByNick){
    mysql.query(
      "DELETE FROM networks WHERE user_id = ? and channel = ?",
      [idsByNick[nick], channel],
      function(err, rows){
        mysql.query(
          "SELECT COUNT(*) as count FROM users where id = ?",
          [idsByNick[nick]],
          function(err, rows){
            if (err)
              logger.debug(err)
            else{
              if (rows[0].count == 0){
                delete idsByNick[nick];
                delete aliases[nick];
              }
            }
          }
        );
      }
    );
  }
}


function userLeft(who){
  var nick = parseStatus(who)[0];
  if (nick in idsByNick){
  
    mysql.query(
      "DELETE FROM networks WHERE user_id = ?",
      [idsByNick[nick]],
      function(){
        delete idsByNick[nick];
        delete aliases[nick];
      }
    );
  }
}
bot.addListener('part', userLeftChannel);
bot.addListener('kick', userLeftChannel);
bot.addListener('kill', userLeft);
bot.addListener('quit', userLeft);
bot.addListener('nick', function(oldNick, newNick, channels) {
  // First check to see if we care about either the old, or new nicks
  var parts = parseStatus(oldNick);
  oldNick = parts[0];
  var oldStatus = parts[1];

  parts = parseStatus(newNick);
  newNick = parts[0];
  var newStatus = parts[1];

  // This means we care.
  if (oldNick in idsByNick){
    if (!newNick in idsByNick){
      // This is the same as the user leaving
      userLeft(oldNick);
      return;
    }
    else{
      // This is just a status update
      if (oldNick in aliases){
        // From a previous non-null status
        delete aliases[oldNick];
      }

      if (newStatus){
        // To a non-null statu
        aliases[newNick] = newNick + "|" + newStatus;
      }

      if (newNick != oldNick){
        logger.error("olcNick should equal newNick, but doesn't: " + JSON.stringify({'oldNick': oldNick, 'newNick': newNick}));
      }


      mysql.query(
        "UPDATE networks SET status = ? WHERE user_id = ?",
        [newStatus, idsByNick[newNick]],
        function(err, results){
          if (err)
            logger.error(err);
        }
      );
    }
  }
  else{
    // This means the user might have changed from something we didn't track to something we do.
    mysql.query(
      "SELECT id FROM users WHERE nick = ?",
      [newNick],
      function(err, rows){
        if (rows.length > 0){
          if (newStatus){
            aliases[newNick] = newNick + "|" + newStatus;
          }
          var userId = rows[0].id;
          idsByNick[newNick] = userId;

          for(var i in channels){
            insertNetworkUpdate(channels[i], userId, newStatus);
          }          
        }
      }
    );
  }
});
  

/*
 *  Returns the nick with status if appropriate
 * 
 */
function activeNick(nick){
  if (nick in aliases)
    return aliases[nick];
  return nick;
}

function parseStatus(nick){
  return nick.split("|", 2);
}

function insertNetworkUpdate(channel, userId, status, botUpdateId){
  mysql.query(
    "REPLACE INTO networks (channel, user_id, status, bot_update_id) VALUES (?, ?, ?, ?)",
    [channel, userId, status, botUpdateId],
    function(err){
      if (err)
        logger.error(err);
    }
  );
}

function updateUserStatus(nick){
  bot.whois(activeNick(nick), function(response){
    var status = parseStatus(activeNick(nick))[1];
    var botUpdateId = uuid.v1();
    for (var i in response.channels){
      bot.join(response.channels[i]);
      insertNetworkUpdate(response.channels[i], idsByNick[nick], status, botUpdateId);
    }
    mysql.query("DELETE FROM networks WHERE user_id = ? AND bot_update_id <> ?", [idsByNick[nick], botUpdateId]);
    //TODO: Issue Published event.
  });
}

function beAGoodLittleWorker(){
  workerRedis.brpop('irc:whois', 'irc:updateUserStatusFromId', 0, function(err, data){

    var args = JSON.parse(data.pop());
    var cmd = data.pop().split(':')[1];

    logger.debug("IRC Daemon servicing " + cmd + " request.");


    // We swap the responseQueue with a callback function.
    var responseQueue = args.pop();

    args.push(function(resp){
      redis.lpush(responseQueue, JSON.stringify(resp));
    });

    switch(cmd){
      case 'whois':
        if (typeof(args[0]) == 'string' && args[0].length > 0){
          bot.whois.apply(bot, args);
        }
        else{
          //callback
          args.pop()({nick: null, error: "Null or empty nick supplied."});
        }
        
        break;

      case 'updateUserStatusFromId': //(id, responseQueue)
        var id = args[0]
        mysql.query(
          "SELECT nick FROM users WHERE id = ?",
          [id],
          function(err, rows){
            if (err){
              logger.error(err);
            }
            else if (rows.length > 0){
              updateUserStatus(rows[0].nick);
              // Callback
              args.pop()({error: null, response: 'OK'});
            }
            else{
              // Callback
              args.pop()({error: "Unable to find User based on id: " + id});
            }
          }
        );
      
        break;
    }
  });


  process.nextTick(beAGoodLittleWorker);
}

beAGoodLittleWorker();
