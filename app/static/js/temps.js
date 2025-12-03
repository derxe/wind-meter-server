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
    $.getJSON(`data/temp.json?duration=${displayDuration}`, function(data) {
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
  data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const tempData = data
      .filter(d => d.temp != null)
      .map(d => ({ x: new Date(d.timestamp).getTime(), y: d.temp }));

  const humData = data
      .filter(d => d.hum != null)
      .map(d => ({ x: new Date(d.timestamp).getTime(), y: d.hum }));

  const lastTemp = tempData[tempData.length-1].y;
  const lastHum  = humData[humData.length-1].y;
  $("#temp-value").text((lastTemp).toFixed(1));
  $("#hum-value").text((lastHum).toFixed(0));

  if (!tempChart) {
  const ctx = document.getElementById('temp-chart').getContext('2d');

  tempChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: "Temperatura (°C)",
          data: tempData,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 2,
          yAxisID: 'yTemp',
          borderColor: "#1e88e5",      // blue
          backgroundColor: "#90caf9", // light blue
          spanGaps: 1 * 60 * 60 * 1000,
        },
        {
          label: "Vlaga (%)",
          data: humData,
          hidden: true,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 2,
          yAxisID: 'yHumidity',
          borderColor: "#a5d6a7",      // green
          backgroundColor: "#a5d6a7",  // light green
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
          labels: { usePointStyle: true, padding: 12 }
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
          suggestedMax: 10,
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

  tempChart.data.datasets[0].data = tempData;
  tempChart.data.datasets[1].data = humData;

  tempChart.update();   
}