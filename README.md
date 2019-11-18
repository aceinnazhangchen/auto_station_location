Add automatic task：

10 */8 * * * node /home/ubuntu/auto_station_location/app.js > /home/ubuntu/auto_station_location/log/$(date +"\%Y-\%m-\%d_\%H").log 2>&1 &

