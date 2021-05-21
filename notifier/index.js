var request = require('request');

exports.handler = function(event, context, callback) {
    
    //TELEGRAM API KEY AND THE ID OF THE RECIPiENT GROUP CHAT OR PRIVATE 1:1 CHAT

    let ApiKey = process.env.API_KEY
    let ChatId = process.env.CHAT_ID

    //PARSE JSON SNS MESSAGE

    var message = event.Records[0].Sns.Message;

    //ENCODING TEXT AND ADDING ALARM EMOJIS
    
    const obj = JSON.parse(message);
    var text = `\xF0\x9F\x9A\xA8\xF0\x9F\x9A\xA8\xF0\x9F\x9A\xA8 \nAlarm Name: ${obj.AlarmName} \nDescription: ${obj.AlarmDescription} \nAWS Account: ${obj.AWSAccountId} \nRegion: ${obj.Region} \nLimit: ${obj.Trigger.Threshold} \nDetail: ${obj.NewStateReason}`
    var url = `https://api.telegram.org/bot${ApiKey}/sendMessage?chat_id=${ChatId}&text=${text}`

    var options = {
      'method': 'GET',
      'url': url
    };
    
    request(options, function (error, response) {
      if (error) throw new Error(error);
    });

    callback(null, "Success");
};