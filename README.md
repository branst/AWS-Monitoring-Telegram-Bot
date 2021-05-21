# AWS Monitoring Telegram Bot

The AWS Monitoring Telegram Bot is a subset of two projects that can be deployed as a single unit. It utilizes a Telegram Bot, AWS Lambda Functions, Amazon API Gateway, IAM Roles and other AWS Services to return real time metrics, alarms and insights of running AWS Services. It constitutes a mechanism for retrieving operational data and it keeps you informed of any alarm changes via a centralized private Telegram group chat.

* Proactive push notifications: when a alarm on Amazon Cloudwatch its breached (status change from OK to ALARM) it triggers a SNS notification that invokes an AWS Lambda which in return sends a message to a Telegram Group / 1:1 Chat via a Bot with the alarm status and its values.

* Reactive status updates: upon request from a Group / 1:1 Chat via a Telegram Bot, the command invokes an AWS Lambda function via an Amazon API Gateway. The Lambda function uses CLAUDIA.JS Bot Builder Framework, it then queries the correct AWS service depending of the utilized command: RDS, ECS, Fargate, Cloudfront, ALB, EC2 and others returning its usage, metrics and indicators.<br /><br />Example: the /rds command will retrieve the database size (via the RDS API) of the specified instance in addition to its current CPU, Memory and IOPS usage utilizing the Cloudwatch Metrics API.

## Architecture Diagram

![Architecture](img/000_diagram.png?raw=true "Architecture")

## Prerequisites

### Creating and interacting with the Telegram Bot

To create a Telegram Bot, you will be required to have a Telegram account. On the Telegram application (Web, Desktop or Mobile) you will have to interact with @BotFather (https://t.me/BotFather) in order to create a Bot. Go through the process, provide the name and username. The Bot Father will reply you back with an Api Key, keep it safe!

![Bot Creation](img/001_bot_creation.png?raw=true "Bot Creation")

Once you created the Bot you need to interact with the Bot Father to add commands to our Bot. I added two commands, one for retrieving RDS metrics and one for ECS/Fargate. Feel free to add your own commands and also edit the Bot information, description and picture.

![Bot Commands](img/002_bot_commands.png?raw=true "Bot Commands")

You should now create a Telegram group and invite the Bot to it alongside any other team members. Once you do that, proceed to type '/' followed by any of the previously created commands. This will initiate our interaction with the Bot.

![Bot Group](img/003_bot_group.png?raw=true "Bot Group")

Lastly, once you initiate the conversation you are now able to fetch our Group Chat ID which you are later going to use on our Lambda functions. You should navigate in a browser to https://api.telegram.org/bot{YourBOTToken}/getUpdates (replacing {YourBOTToken} with the token you got from the BotFather). You should annotate the Chat ID, in my case: '-584694398'.

![Bot Chat ID](img/004_bot_chat_id.png?raw=true "Bot Chat ID")

### AWS CLI, NodeJS & CLAUDIA.JS

To deploy the Lambda functions you are going to need the AWS CLI, NodeJS and CLAUDIA.JS.

* AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
* NodeJS: https://nodejs.org/en/
* CLAUDIA.JS: https://claudiajs.com/tutorials/installing.html

Once you install each requirement, make sure you properly configured your AWS Credentials and Region using ``` aws configure ``` with the correct keys. It will require a user which has at least Cloudwatch, SNS, IAM, Lambda and ApiGateway FullAccess permissions.

The next steps assume you will be working on us-east-1 (N. Virginia) but you can deploy this solution to any other AWS region, make sure to adapt the scripts and templates below.

### SNS Topic

Using the AWS CLI you are going to create the SNS Topic that is going to receive the alarm's status changes and then trigger notifications to our Lambda function. 

``` 
aws sns create-topic --name CW_Alarms_To_Lambda
```

### Cloudwatch Alarms

Using the AWS CLI you are going to create a Cloudwatch Alarm that is going to trigger notifications into the SNS topic upon metrics changes on AWS Services. For demo purposes I will create an Alarm based on the maximum ECS/Fargate CPU percentage usage in a 1 minute period.

You will need to replace the {AccountId}, {ServiceName} and {ClusterName} with your corresponding values to monitor an ECS Service, it can also be used to monitor other AWS Services by replacing the namespace and dimesions.

Make sure to give it a proper name and description since you will be receiving this information later on the notifications.

```
aws cloudwatch put-metric-alarm --alarm-name Alarm-ECS-CPU-USAGE --alarm-description "Monitoring for CPU usage of Fargate on ECS. When exceeds 50% over a 5-minutes period" --metric-name CPUUtilization --namespace AWS/ECS --statistic Maximum --period 60 --threshold 50 --comparison-operator GreaterThanThreshold  --dimensions Name=ServiceName,Value={ServiceName} Name=ClusterName,Value={ClusterName} --evaluation-periods 1 --alarm-actions arn:aws:sns:us-east-1:{AccountId}:CW_Alarms_To_Lambda --unit Percent
```

Continue to repeat this process for each alarm you want to create, using always the same SNS Topic.

### [Optional] Social Media Dashboard 

To use the built-in command /tweets you are going to need to deploy the AWS Social Media Dashboard solution which utilizes a set of AWS resources to perform real time analysis of Tweets using pre defined search prefixes, it then categorizes them and applies Machine Learning using Amazon Comprehend to detect intent, emotions and custom entities.

You will be able to analyze in real time any negative or positive Tweets about your company, its products or features to ensure availability and user complaints, feedback or comments.

![Tweets](img/015_tweets.png?raw=true "Tweets")

To deploy this solution, follow the steps detailed on: https://aws.amazon.com/solutions/implementations/ai-driven-social-media-dashboard/.

Once you finished deploying it, you will need to annotate the Glue Catalog, Glue Database and Athena Output Bucket for later use.

## Deploy

### Lambda Notifier

First let's deploy the Lambda Notifier, using the AWS CLI. You will need to clone the repo which contains the code for both Lambda functions.

```
git clone https://github.com/branst/AWS-Monitoring-Telegram-Bot
cd AWS-Monitoring-Telegram-Bot/notifier 
```

Let's create an IAM Role for the Lambda function.

``` 
aws iam create-role --role-name lambda-notifier-role --assume-role-policy-document file://trust-policy.json 
```

Now you are going to assign it basic permissions so it can log any output or errors to Amazon Cloudwatch Logs.

``` 
aws iam attach-role-policy --role-name lambda-notifier-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 
```

Let's install the dependencies, zip them, create and deploy the function (make sure to replace the AccountI, ApiKey and ChatID with yours).

```  
npm install
zip -r function.zip . -x trust-policy.json
aws lambda create-function --function-name aws-lambda-telegram-notifier --zip-file fileb://function.zip --handler index.handler --runtime nodejs12.x --role arn:aws:iam::{AccountId}:role/lambda-notifier-role --environment "Variables={API_KEY={APIKey},CHAT_ID={ChatID}}"
```

Now you need to Subscribe the newly created Lambda function to the existing SNS Topic. Replace twice the AccountId with yours.

```
aws sns subscribe --topic-arn arn:aws:sns:us-east-1:{AccountId}:CW_Alarms_To_Lambda --protocol lambda --notification-endpoint arn:aws:lambda:us-east-1:{AccountId}:function:aws-lambda-telegram-notifier
```

Once subscribed, you can make a test by simulating an alarm breach, it'll introduce a message into the SNS Topic which will notify the Lambda that is going to send the Telegram message back to us. Replace once again the AccountId with yours.

```
aws sns publish --topic-arn arn:aws:sns:us-east-1:{AccountId}:CW_Alarms_To_Lambda --message '{"AlarmName":"Alarm-ECS-CPU-USAGE","AlarmDescription":"Monitoring for CPU usage of Fargate on ECS. When exceeds 50% over a 5-minutes period","AWSAccountId":"123412341234","NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 1 out of the last 1 datapoints [60.016108253970742226 (22/05/21 02:08:00)] was greater than or equal to the threshold (50.0) (minimum 1 datapoint for OK -> ALARM transition).","StateChangeTime":"2021-05-22T02:09:53.351+0000","Region":"US East (N. Virginia)","AlarmArn":"arn:aws:cloudwatch:us-east-1:123412341234:alarm:Alarm-ECS-CPU-USAGE","OldStateValue":"OK","Trigger":{"MetricName":"CPUUtilization","Namespace":"AWS/ECS","StatisticType":"Statistic","Statistic":"MAXIMUM","Unit":null,"Dimensions":[{"value":"svc-nginx","name":"ServiceName"},{"value":"FargateEcscluster","name":"ClusterName"}],"Period":60,"EvaluationPeriods":1,"ComparisonOperator":"LessThanOrEqualToThreshold","Threshold":50.0,"TreatMissingData":"- TreatMissingData:missing","EvaluateLowSampleCountPercentile":""}}'
```

![CW Alarm Test](img/011_lambda_notifier_alarm.png?raw=true "CW Alarm Test")

You managed to get the first Lambda function working, now each alarm breached that has the SNS Topic as a destination will generate a push notification to our Telegram Group.

### Lambda Bot

To the deploy the second Lambda function let's use the CLAUDIA.JS CLI. It requires a [JSON file](bot/aditional_policies.json) which contains additional IAM Policies to access RDS, ECS, Cloudwatch and Athena. Feel free to add more policies as needed. 

List of supported services, commands and their required environment variables.

| Service    | Command     | ENV-VAR                                           | Example                                                                                                 | IAM Permission                                                                |
|------------|-------------|---------------------------------------------------|---------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| RDS        | /rds        | RDSName                                           | rds-cluster                                                                                             | rds:DescribeDBInstances, cloudwatch:GetMetricData                             |
| Fargate    | /fargate    | ClusterName, ServiceName                          | ecs-cluster, ecs-service                                                                                | ecs:DescribeServices, cloudwatch:GetMetricData                                |
| ALB        | /alb        | ALBName                                           | app/prod-alb/6acd7711cb231234a                                                                          | cloudwatch:GetMetricData                                                      |
| Cloudfront | /cloudfront | CFName                                            | E3HLAS45R3QD7I                                                                                          | cloudwatch:GetMetricData                                                      |
| Tweets     | /tweets     | GlueCatalog, GlueDatabase, AthenaOutputBucketName | AwsDataCatalog, ai_driven_social_media_dashboard, s3://aws-athena-query-results-123412341234-us-east-1/ | cloudwatch:GetMetricData, athena:StartQueryExecution, athena:GetQueryResults  |
| Cloudwatch Alarms     | /alarms     | n/a                                               | n/a                                                                                                     | cloudwatch:DescribeAlarms                                                     |

#### Notes

If you try to contact the Bot from an unauthorized chat it will not allow you to retrieve the information.

![Lambda Auth](img/014_lambda_bot_auth.png?raw=true "Lambda Auth")

ChatId is a required environment variable (eg: ['-58469439','-58469440'] ) it supports an array of strings, so you can authorize the Bot to reply to multiple Groups or 1:1 Chats.

Run the following commands to add your Telegram Bot UserName. Replace 'MyBotUserName' with yours.

```
cd ../bot 
sed -i '.bak' 's/BotUserName/MyBotUserName/g' bot.js
rm bot.js.bak
```

To use additional AWS services you will be required to go back to the Bot Father and add the needed commands (eg: /rds, /cloudfront, /alb) to trigger a Bot proper response to it.

You can set up the required environment variables by using the --set-env parameter on the Claudia create command.

If you deployed the Social Media Dashboard Solution make sure to include its values into the parameters of the deployment command.

Not all environment variables are required for the Bot to work, for example, if you only want to monitor an ECS deployment, you just need to provide the ServiceName and ClusterName in addition to ChatId. You will see this scenario on the deploy command below. 

#### Deploy Lambda Bot

```
claudia create --region us-east-1 --api-module bot --name aws-lambda-telegram-bot --set-env "ChatId=['-58469439'],ClusterName=ecs-cluster,ServiceName=ecs-service" --policies aditional_policies.json --timeout 10
```

Once created, you can also modify or add new environment variables from the AWS Lambda console.

![Lambda Env](img/012_lambda_bot_env.png?raw=true "Lambda Env")

You need to configure the Bot to work with Telegram, run the following command providing when prompted the API Key for the Bot.

```
claudia update --configure-telegram-bot
```

Finally for testing the Bot, you can go back to the Telegram Group and type /fargate to see our ECS/Fargate metrics.

![Lambda Demo](img/013_lambda_bot_demo.png?raw=true "Lambda Demo")

#### Update Lambda Bot

To perform updates on the code for the Bot, you will need to run the following command.

```
claudia update
```

## Feedback

Any feedback, issues or comments are welcome.  
Feel free to submit PRs to support additional AWS Services or features.

## Customizations

The Bot can be extended to work with other AWS Services and also provide insights for more than one 'Ec2/Database/Cloudfront' running at the time, for example, by returning all RDS instances based on a AWS Resource Tag instead of having to manually provide the Database Instance Name.

## License Summary

This sample code is made available under the MIT-0 license. See the [LICENSE file](LICENSE.txt).



