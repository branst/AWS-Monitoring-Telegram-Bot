//*****************//
//MAKE SURE TO REPLACE {BotUserName} WITH YOUR BOT USERNAME
//*****************//

//DEPENDENCIES FOR API CALLS USING AWS JS SDK V3
//https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/index.html

const { CloudWatchClient, DescribeAlarmsCommand,GetMetricDataCommand } = require("@aws-sdk/client-cloudwatch");
const { ECSClient, DescribeServicesCommand } = require("@aws-sdk/client-ecs");
const { RDSClient, DescribeDBInstancesCommand } = require("@aws-sdk/client-rds");
const { AthenaClient, StartQueryExecutionCommand,GetQueryResultsCommand } = require("@aws-sdk/client-athena");

//ENV VARIBLE FOR AWS REGION

const AWSRegion = 'us-east-1'

const cwclient = new CloudWatchClient({ region: AWSRegion });
const ecsclient = new ECSClient({ region: AWSRegion });
const rdsclient = new RDSClient({ region: AWSRegion });
const athenaclient = new AthenaClient({ region: AWSRegion });

//60000 MS EQUALS A MINUTE (JUST IN CASE)
const MS_PER_MINUTE = 60000;

//MORE ENV VARIABLES, ADD THEM ON AWS LAMBDA CONSOLE

const ChatId = process.env.ChatId
const ClusterName = process.env.ClusterName
const ServiceName = process.env.ServiceName
const RDSName = process.env.RDSName
const ALBName = process.env.ALBName
const CFName = process.env.CFName

//TWEETS OPTIONAL FEATURE 
//CREATE A S3 OUTPUT BUCKET ON ATHENA IF YOU WANT TO ENABLE THIS FEATURE

const GlueCatalog = process.env.GlueCatalog
const GlueDatabase = process.env.GlueDatabase
const AthenaOutputBucketName = process.env.AthenaOutputBucketName 

var botBuilder = require('claudia-bot-builder');

module.exports = botBuilder(async function (request) {

	var msg = ''
	var now = new Date;
	var data;

	//IT RETRIEVES AUTHORIZED ARRAYS OF CHAT IDS FROM THE ENV, IF THE ID DOESN'T MATCH IT WILL REJECT THE REQUEST
	if(! ChatId.includes(request.sender)){
		return 'Unauthorized'
	}

	switch (request.text) {
		
		//THIS USE CASE RETURNS ALARMS WHICH STATE ITS 'ALARM'
		case '/alarms':
		case '/alarms@BotUserName':

			const paramsCW = {
			  StateValue: 'ALARM'
			};
			const commandCW = new DescribeAlarmsCommand(paramsCW);
			
			try {
			  data = await cwclient.send(commandCW);
			} catch (error) {
			  console.log(error);
			} 
			
			if (data.MetricAlarms.length === 0){
				msg='No Active Alarms'
			}else{
				msg='Active Alarms: ';
				data.MetricAlarms.forEach(element => msg+='\n'+element.AlarmName);
			}
			break;

		//THIS USE CASE RETURNS NEGATIVE TWEETS USING ATHENA, IT REQUIRES THE DEPLOY OF AI-DRIVEN SOCIAL MEDIA DASHBOARD
		//https://aws.amazon.com/solutions/implementations/ai-driven-social-media-dashboard/
		case '/tweets':
		case '/tweets@BotUserName':

			//ADAPT SQL STATEMENT AS YOU SEE FIT FOR YOUR USE CASE
			sconst paramsAthena = {
			  QueryString: 'SELECT tweetid, text, sentiment FROM tweet_sentiments WHERE sentiment like \'NEGATIVE\' ORDER BY date desc limit 10;',
			  QueryExecutionContext: {
			    Catalog: GlueCatalog,
			    Database: GlueDatabase
			  },
			  ResultConfiguration: {
			   OutputLocation: AthenaOutputBucketName //CREATE A S3 OUTPUT BUCKET ON ATHENA AND SET IT AS ENV VARIABLE
			  }
			};
			const commandAthena = new StartQueryExecutionCommand(paramsAthena);
			
			try {
			  data = await athenaclient.send(commandAthena);
			} catch (error) {
			  console.log(error);
			} 

			//AWAIT TO RETURN ATHENA QUERY RESULTS, IT CAN ALSO BE IMPLEMENTED BY HAVING A CW EVENT WITH A CALLBACK
			await sleep(5000); 
			
			var paramsAthenaResult = {
			  QueryExecutionId: data.QueryExecutionId
			};

			const commandAthenaResults = new GetQueryResultsCommand(paramsAthenaResult);

			try {
			  dataResults = await athenaclient.send(commandAthenaResults);
			} catch (error) {
			  console.log(error);
			} 
			
			if (dataResults.ResultSet.Rows.length === 0){
				msg='No new Tweets'
			}else{
				msg='New Tweets:';
				dataResults.ResultSet.Rows.forEach((element, index) => {
				 	if (index === 0) return;
					msg+='\nhttps://twitter.com/i/web/status/'+ element.Data[0].VarCharValue + ' | ' +  element.Data[1].VarCharValue + ' | ' +  element.Data[2].VarCharValue;
				});
			}
			break;

		//THIS USE CASE RETURNS THE METRICS OF AN ECS SERVICE
		case '/fargate':
		case '/fargate@BotUserName':

			var data_fargate;
			const paramsECS = {
			  cluster: ClusterName,
			  services: [ServiceName] //COULD RETRIEVE AN ARRAY OF ECS SERVICES
			};
			const commandECS = new DescribeServicesCommand(paramsECS);
			
			try {
			  data_fargate = await ecsclient.send(commandECS);
			} catch (error) {
			  console.log(error);
			} 
			
			if (data_fargate.services.length === 0){
				msg='No Running Service with that name'
			}else{

				//IF WE FOUND A MATCHING RUNNING SERVICE, WE ARE GOING TO RETRIEVE ITS METRICS FROM CW METRICS
				//CPU AND MEMORY USAGE
				var data_fargate_cw;
				const paramsECS_CW = {
				  EndTime: new Date(now - 1 * MS_PER_MINUTE),
				  MetricDataQueries: [ 
				    {
				      Id: 'm1', 
				      MetricStat: {
				        Metric: { 
				          Dimensions: [
				            {
				              Name: 'ClusterName', 
				              Value: ClusterName
				            },
				            {
				              Name: 'ServiceName', 
				              Value: ServiceName
				            }
				          ],
				          MetricName: 'CPUUtilization',
				          Namespace: 'AWS/ECS'
				        },
				        Period: '1', 
				        Stat: 'Average',
				        Unit: 'Percent'
				      }
				    },
				    {
				      Id: 'm2', 
				      MetricStat: {
				        Metric: { 
				          Dimensions: [
				            {
				              Name: 'ClusterName', 
				              Value: ClusterName
				            },
				            {
				              Name: 'ServiceName', 
				              Value: ServiceName
				            }
				          ],
				          MetricName: 'MemoryUtilization',
				          Namespace: 'AWS/ECS'
				        },
				        Period: '1', 
				        Stat: 'Average',
				        Unit: 'Percent'
				      }
				    }
				  ],
				  StartTime: new Date(now - 5 * MS_PER_MINUTE)
				};

				const commandECS_CW = new GetMetricDataCommand(paramsECS_CW);
				
				try {
				  data_fargate_cw = await cwclient.send(commandECS_CW);
				} catch (error) {
				  console.log(error);
				} 
				
				msg=`Running Containers: ${data_fargate.services[0].runningCount}\nCPU: ${data_fargate_cw.MetricDataResults[0].Values[0]}%\nMemory: ${data_fargate_cw.MetricDataResults[1].Values[0]}%`;
			}
			break;

		//THIS USE CASE RETURNS THE METRICS OF AN ALB

		case '/alb':
		case '/alb@BotUserName':

			//WE ARE GOING TO RETRIEVE ITS METRICS FROM CW METRICS
			//REQUESTS, CONNECTIONS, RESPONSE TIMES AND ERRORS
			var data_alb_cw;
			const paramsALB_CW = {
			  EndTime: new Date(now - 1 * MS_PER_MINUTE),
			  MetricDataQueries: [ 
			    {
			      Id: 'm1', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'LoadBalancer', 
			              Value: ALBName
			            }
			          ],
			          MetricName: 'RequestCount',
			          Namespace: 'AWS/ApplicationELB'
			        },
			        Period: '1', 
			        Stat: 'Sum',
			        Unit: 'Count'
			      }
			    },
			    {
			      Id: 'm2', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'LoadBalancer', 
			              Value: ALBName
			            }
			          ],
			          MetricName: 'ActiveConnectionCount',
			          Namespace: 'AWS/ApplicationELB'
			        },
			        Period: '1', 
			        Stat: 'Sum',
			        Unit: 'Count'
			      }
			    },
			    {
			      Id: 'm3', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'LoadBalancer', 
			              Value: ALBName
			            }
			          ],
			          MetricName: 'NewConnectionCount',
			          Namespace: 'AWS/ApplicationELB'
			        },
			        Period: '1', 
			        Stat: 'Sum',
			        Unit: 'Count'
			      }
			    },
			    {
			      Id: 'm4', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'LoadBalancer', 
			              Value: ALBName
			            }
			          ],
			          MetricName: 'HTTPCode_ELB_5XX_Count',
			          Namespace: 'AWS/ApplicationELB'
			        },
			        Period: '1', 
			        Stat: 'Sum',
			        Unit: 'Count'
			      }
			    },
			    {
			      Id: 'm5', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'LoadBalancer', 
			              Value: ALBName
			            }
			          ],
			          MetricName: 'HTTPCode_ELB_4XX_Count',
			          Namespace: 'AWS/ApplicationELB'
			        },
			        Period: '1', 
			        Stat: 'Sum',
			        Unit: 'Count'
			      }
			    },
			    {
			      Id: 'm6', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'LoadBalancer', 
			              Value: ALBName
			            }
			          ],
			          MetricName: 'TargetResponseTime',
			          Namespace: 'AWS/ApplicationELB'
			        },
			        Period: '1', 
			        Stat: 'Average',
			        Unit: 'Seconds'
			      }
			    }
			  ],
			  StartTime: new Date(now - 5 * MS_PER_MINUTE)
			};

			const commandALB_CW = new GetMetricDataCommand(paramsALB_CW);
			
			try {
			  data_alb_cw = await cwclient.send(commandALB_CW);
			} catch (error) {
			  console.log(error);
			} 
			
			msg=`Request/m: ${data_alb_cw.MetricDataResults[0].Values[0]}\n4xx: ${data_alb_cw.MetricDataResults[4].Values[0]}\n5xx: ${data_alb_cw.MetricDataResults[3].Values[0]}\nResponse Time: ${data_alb_cw.MetricDataResults[5].Values[0]}\nActive Connections: ${data_alb_cw.MetricDataResults[1].Values[0]}\nNew Connections: ${data_alb_cw.MetricDataResults[2].Values[0]}\n `;
			break;

		//THIS USE CASE RETURNS THE METRICS OF A CLOUDFRONT DISTRIBUTION
		case '/cloudfront':
		case '/cloudfront@BotUserName':

			//WE ARE GOING TO RETRIEVE ITS METRICS FROM CW METRICS
			//REQUESTS, BYTES AND ERRORS
			var data_cf_cw;
			const paramsCF_CW = {
			  EndTime: new Date(now - 1 * MS_PER_MINUTE),
			  MetricDataQueries: [ 
			    {
			      Id: 'm1', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'Region', 
			              Value: 'Global'
			            },
			            {
			              Name: 'DistributionId', 
			              Value: CFName
			            }
			          ],
			          MetricName: 'Requests',
			          Namespace: 'AWS/CloudFront'
			        },
			        Period: '1', 
			        Stat: 'Sum',
			        Unit: 'None'
			      }
			    },
			    {
			      Id: 'm2', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'Region', 
			              Value: 'Global'
			            },
			            {
			              Name: 'DistributionId', 
			              Value: CFName
			            }
			          ],
			          MetricName: 'BytesDownloaded',
			          Namespace: 'AWS/CloudFront'
			        },
			        Period: '1', 
			        Stat: 'Sum',
			        Unit: 'None'
			      }
			    },
			    {
			      Id: 'm3', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'Region', 
			              Value: 'Global'
			            },
			            {
			              Name: 'DistributionId', 
			              Value: CFName
			            }
			          ],
			          MetricName: '4xxErrorRate',
			          Namespace: 'AWS/CloudFront'
			        },
			        Period: '1', 
			        Stat: 'Average',
			        Unit: 'Percent'
			      }
			    },
			    {
			      Id: 'm4', 
			      MetricStat: {
			        Metric: { 
			          Dimensions: [
			            {
			              Name: 'Region', 
			              Value: 'Global'
			            },
			            {
			              Name: 'DistributionId', 
			              Value: CFName
			            }
			          ],
			          MetricName: '5xxErrorRate',
			          Namespace: 'AWS/CloudFront'
			        },
			        Period: '1', 
			        Stat: 'Average',
			        Unit: 'Percent'
			      }
			    }
			 	],
			  StartTime: new Date(now - 5 * MS_PER_MINUTE)
			};

			const commandCF_CW = new GetMetricDataCommand(paramsCF_CW);
			
			try {
			  data_cf_cw = await cwclient.send(commandCF_CW);
			} catch (error) {
			  console.log(error);
			} 
			
			msg=`Request/m: ${data_cf_cw.MetricDataResults[0].Values[0]}\nDownloaded GBs/m: ${data_cf_cw.MetricDataResults[1].Values[0]/1024/1024/1024}\n4xx: ${data_cf_cw.MetricDataResults[2].Values[0]}\n5xx: ${data_cf_cw.MetricDataResults[3].Values[0]} `;
			break;

		//THIS USE CASE RETURNS THE METRICS OF A RDS INSTANCE
		case '/rds':
		case '/rds@BotUserName':
			
			const paramsRDS = {
			  DBInstanceIdentifier: RDSName
			};
			const commandRDS = new DescribeDBInstancesCommand(paramsRDS);
			
			try {
			  data = await rdsclient.send(commandRDS);
			} catch (error) {
			  console.log(error);
			} 
			
			if (data.DBInstances.length === 0){
				msg='No Running Instance'
			}else{

				//IF WE FOUND IT, WE ARE GOING TO RETRIEVE ITS METRICS FROM CW METRICS
				//CPU, CONNECTIONS AND IOPS
				var data_rds_cw;
				const paramsRDS_CW = {
				  EndTime: new Date(now - 1 * MS_PER_MINUTE),
				  MetricDataQueries: [ 
				    {
				      Id: 'm1', 
				      MetricStat: {
				        Metric: { 
				          Dimensions: [
				            {
				              Name: 'DBInstanceIdentifier', 
				              Value: RDSName
				            }
				          ],
				          MetricName: 'CPUUtilization',
				          Namespace: 'AWS/RDS'
				        },
				        Period: '1', 
				        Stat: 'Average',
				        Unit: 'Percent'
				      }
				    },
				    {
				      Id: 'm2', 
				      MetricStat: {
				        Metric: { 
				          Dimensions: [
				            {
				              Name: 'DBInstanceIdentifier', 
				              Value: RDSName
				            }
				          ],
				          MetricName: 'ReadIOPS',
				          Namespace: 'AWS/RDS'
				        },
				        Period: '1', 
				        Stat: 'Average',
				        Unit: 'Count/Second'
				      }
				    },
				    {
				      Id: 'm3', 
				      MetricStat: {
				        Metric: { 
				          Dimensions: [
				            {
				              Name: 'DBInstanceIdentifier', 
				              Value: RDSName
				            }
				          ],
				          MetricName: 'WriteIOPS',
				          Namespace: 'AWS/RDS'
				        },
				        Period: '1', 
				        Stat: 'Average',
				        Unit: 'Count/Second'
				      }
				    },
				    {
				      Id: 'm4', 
				      MetricStat: {
				        Metric: { 
				          Dimensions: [
				            {
				              Name: 'DBInstanceIdentifier', 
				              Value: RDSName
				            }
				          ],
				          MetricName: 'DatabaseConnections',
				          Namespace: 'AWS/RDS'
				        },
				        Period: '1', 
				        Stat: 'Average',
				        Unit: 'Count'
				      }
				    }

				  ],
				  StartTime: new Date(now - 5 * MS_PER_MINUTE)
				};

				const commandRDS_CW = new GetMetricDataCommand(paramsRDS_CW);
				
				try {
				  data_rds_cw = await cwclient.send(commandRDS_CW);
				} catch (error) {
				  console.log(error);
				} 

				msg=`Size: ${data.DBInstances[0].DBInstanceClass}\nCPU: ${data_rds_cw.MetricDataResults[0].Values[0]}%\nRead/s: ${data_rds_cw.MetricDataResults[1].Values[0]}\nWrite/s: ${data_rds_cw.MetricDataResults[2].Values[0]}\nConnections: ${data_rds_cw.MetricDataResults[3].Values[0]}`;
			}
			break;

		default: 
			msg='No match found for your request'
			break;
	}
	return msg
});

//FUNCTION TO AWAIT ATHENA RESULTS
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

