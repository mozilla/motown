# The IRC Bot

## messages

Redis Key:
'contacts.userStatusUpdate'

Data:
{
  topic: 'userStatusUpdate',
  data: {
    'id': <id>,
    'nick': <base nick>,
    'status': <status>,
    'networks': response.channels
  }
}

Redis Key:
'contacts.userOffline'

{
  topic: 'userOffline',
  data: {
    nick: <baseNick>
  }
}

Redis Key:

'contacts.reset'

{
  topic: 'reset'
}