console.log("temps.js loaded");

$(function() {
    displayDuration = $('#select-display-duration').val();
    $('#select-display-duration').on('change', function () {
      displayDuration = parseInt($(this).val(), 10);
      console.log("Display duration temperature:", displayDuration);
      loadTempData();
    });
    getTempData();
});


/* TODO change to only show loading of the temp graph */
function showLoadingTemp(isLoading) {
  if(isLoading) {
    $('.temp-chart-holder #loading-msg').show();
    $('#temp-chart').hide();
  } else {
    $('.temp-chart-holder #loading-msg').hide();
    $('#temp-chart').show();
  }
}

function loadTempData() {
    showLoadingTemp(true);
    const base = window.location.pathname;
    $.getJSON(`${base}/data/temp.json?duration=${displayDuration}`, function(data) {
        showLoadingTemp(false);

        console.log('Temperature data loaded:', data);
        updateTempGraph(data);
    });
}

function getTempData() {
  if(preloadedTempData) {
    showLoadingTemp(false);
    updateTempGraph(preloadedTempData);
  } else {
    loadTempData();
  }

}


let tempChart;
function updateTempGraph(data) {
  if(data.length == 0) return;
  data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const tempData = data
      .filter(d => d.temp != null)
      .map(d => ({ x: new Date(d.timestamp).getTime(), y: d.temp }));

  const humData = data
      .filter(d => d.hum != null)
      .map(d => ({ x: new Date(d.timestamp).getTime(), y: d.hum }));

  const tempData_in = data
      .filter(d => d.temp_in != null)
      .map(d => ({ x: new Date(d.timestamp).getTime(), y: d.temp_in }));

  const humData_in = data
          .filter(d => d.hum_in != null)
          .map(d => ({ x: new Date(d.timestamp).getTime(), y: d.hum_in }));
  

  const lastTemp = tempData[tempData.length-1].y;
  const lastHum  = humData[humData.length-1].y;
  $("#temp-value").text((lastTemp).toFixed(1));
  $("#hum-value").text((lastHum).toFixed(0));
 
  let maxTemp = Math.max(...tempData.map(p => p.y));
  let minTemp = Math.min(...tempData.map(p => p.y));
  let diffTemp = maxTemp - minTemp;
  const roundUp5 = v => Math.ceil(v / 5) * 5;
  const roundDown5 = v => Math.floor(v / 5) * 5;

  if (diffTemp < 10) {
    const center = (maxTemp + minTemp) / 2;

    maxTemp = roundUp5(center + 10);
    minTemp = roundDown5(center - 10);
  } else {
    maxTemp = roundUp5(maxTemp);
    minTemp = roundDown5(minTemp);
  }

  if (!tempChart) {
  const ctx = document.getElementById('temp-chart').getContext('2d');

  tempChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        // --- TEMPERATURA ZUNAJ ---
        {
          label: "Temperatura (°C)",
          data: tempData,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 2,
          yAxisID: "yTemp",
          borderColor: "#1e88e5",      // blue
          backgroundColor: "#90caf9",
          spanGaps: 1 * 60 * 60 * 1000,
        },

        // --- VLAGA ZUNAJ ---
        {
          label: "Vlaga (%)",
          data: humData,
          hidden: true,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 2,
          yAxisID: "yHumidity",
          borderColor: "#43a047",      // green (stronger)
          backgroundColor: "#a5d6a7",
          spanGaps: 1 * 60 * 60 * 1000,
        },

        // --- TEMPERATURA ZNOTRAJ ---
        {
          label: "Temperatura znotraj (°C)",
          data: tempData_in,
          hidden: true,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 2,
          yAxisID: "yTemp",
          borderColor: "#fb8c00",      // orange
          backgroundColor: "#ffcc80",
          spanGaps: 1 * 60 * 60 * 1000,
        },

        // --- VLAGA ZNOTRAJ ---
        {
          label: "Vlaga znotraj (%)",
          data: humData_in,
          hidden: true,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 2,
          yAxisID: "yHumidity",
          borderColor: "#8e24aa",      // purple
          backgroundColor: "#ce93d8",
          spanGaps: 1 * 60 * 60 * 1000,
        },
      ]
    },
    options: {
      animation: { duration: 0 },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { 
            usePointStyle: true, 
            padding: 12,
            filter: (legendItem, chart) => { // show only legend items if there is any data inside
              const ds = chart.datasets[legendItem.datasetIndex];
              return Array.isArray(ds.data) && ds.data.length > 0;
            }
          }
        }
      },
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      scales: {
        x: {
          type: 'time',
          time: { displayFormats: { minute: 'HH:mm' } },
          ticks: {
            callback: (val) => {
              const d = new Date(val);
              if (d.getMinutes() % 60 !== 0) return null;
              return d.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              });
            }
          }
        },

        // Temperature axis (LEFT)
        yTemp: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          min: minTemp,
          max: maxTemp,
        },

        // Humidity axis (RIGHT)
        yHumidity: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false }, // no grid overlap
        }
      }
    }
  });
}

  tempChart.options.scales.yTemp.min = minTemp;
  tempChart.options.scales.yTemp.max = maxTemp;

  tempChart.data.datasets[0].data = tempData;
  tempChart.data.datasets[1].data = humData;

  tempChart.data.datasets[2].data = tempData_in;
  tempChart.data.datasets[3].data = humData_in;

  tempChart.update();   
}