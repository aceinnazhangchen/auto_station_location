Add automatic task：

10 */8 * * * node /home/ubuntu/auto_tool/app.js > /home/ubuntu/auto_tool/log/$(date +"\%Y-\%m-\%d_\%H").log 2>&1 &
