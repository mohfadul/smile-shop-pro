// FREE ALTERNATIVE: Open-source charting service using Chart.js data preparation
// This service prepares data for frontend charting libraries (Chart.js, Recharts, Plotly)
// Replaces paid dashboard/visualization services

const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'charting-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class ChartingService {
  constructor() {
    this.isConfigured = true; // Always available since it's open-source
    this.supportedChartTypes = [
      'line', 'bar', 'pie', 'doughnut', 'area', 'scatter', 
      'radar', 'polarArea', 'bubble', 'mixed'
    ];
  }

  // FREE ALTERNATIVE: Prepare Chart.js compatible data (replaces paid charting APIs)
  prepareChartJSData(data, chartConfig) {
    try {
      logger.info(`📊 Preparing Chart.js data for ${chartConfig.type} chart (FREE)`);

      const chartData = {
        type: chartConfig.type,
        data: {
          labels: [],
          datasets: []
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: chartConfig.title || 'Chart',
              font: { size: 16, weight: 'bold' }
            },
            legend: {
              display: chartConfig.showLegend !== false,
              position: chartConfig.legendPosition || 'top'
            },
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false
            }
          },
          scales: this.getScalesConfig(chartConfig.type, chartConfig.scales),
          animation: {
            duration: chartConfig.animated !== false ? 1000 : 0
          }
        }
      };

      // Process data based on chart type
      switch (chartConfig.type) {
        case 'line':
        case 'area':
          return this.prepareLineChartData(data, chartConfig, chartData);
        
        case 'bar':
          return this.prepareBarChartData(data, chartConfig, chartData);
        
        case 'pie':
        case 'doughnut':
          return this.preparePieChartData(data, chartConfig, chartData);
        
        case 'scatter':
        case 'bubble':
          return this.prepareScatterChartData(data, chartConfig, chartData);
        
        case 'radar':
          return this.prepareRadarChartData(data, chartConfig, chartData);
        
        case 'mixed':
          return this.prepareMixedChartData(data, chartConfig, chartData);
        
        default:
          throw new Error(`Unsupported chart type: ${chartConfig.type}`);
      }

    } catch (error) {
      logger.error('📊 Failed to prepare Chart.js data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // FREE ALTERNATIVE: Prepare Recharts compatible data
  prepareRechartsData(data, chartConfig) {
    try {
      logger.info(`📊 Preparing Recharts data for ${chartConfig.type} chart (FREE)`);

      const rechartsData = {
        data: [],
        config: {
          width: chartConfig.width || 800,
          height: chartConfig.height || 400,
          margin: chartConfig.margin || { top: 20, right: 30, left: 20, bottom: 5 }
        }
      };

      // Transform data for Recharts format
      if (Array.isArray(data)) {
        rechartsData.data = data.map(item => {
          const transformedItem = {};
          
          // Handle different data structures
          if (typeof item === 'object') {
            Object.keys(item).forEach(key => {
              transformedItem[key] = item[key];
            });
          }
          
          return transformedItem;
        });
      } else if (typeof data === 'object') {
        // Convert object to array format
        rechartsData.data = Object.keys(data).map(key => ({
          name: key,
          value: data[key],
          ...data[key]
        }));
      }

      return {
        success: true,
        chartData: rechartsData,
        library: 'recharts',
        generator: 'ChartingService (FREE)'
      };

    } catch (error) {
      logger.error('📊 Failed to prepare Recharts data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // FREE ALTERNATIVE: Prepare Plotly.js compatible data
  preparePlotlyData(data, chartConfig) {
    try {
      logger.info(`📊 Preparing Plotly.js data for ${chartConfig.type} chart (FREE)`);

      const plotlyData = {
        data: [],
        layout: {
          title: chartConfig.title || 'Chart',
          width: chartConfig.width || 800,
          height: chartConfig.height || 400,
          showlegend: chartConfig.showLegend !== false,
          hovermode: 'closest'
        },
        config: {
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
        }
      };

      // Process data based on chart type
      switch (chartConfig.type) {
        case 'line':
          plotlyData.data = this.preparePlotlyLineData(data, chartConfig);
          break;
        
        case 'bar':
          plotlyData.data = this.preparePlotlyBarData(data, chartConfig);
          break;
        
        case 'pie':
          plotlyData.data = this.preparePlotlyPieData(data, chartConfig);
          break;
        
        case 'scatter':
          plotlyData.data = this.preparePlotlyScatterData(data, chartConfig);
          break;
        
        case 'heatmap':
          plotlyData.data = this.preparePlotlyHeatmapData(data, chartConfig);
          break;
        
        default:
          throw new Error(`Unsupported Plotly chart type: ${chartConfig.type}`);
      }

      return {
        success: true,
        chartData: plotlyData,
        library: 'plotly',
        generator: 'ChartingService (FREE)'
      };

    } catch (error) {
      logger.error('📊 Failed to prepare Plotly data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Chart.js specific data preparation methods
  prepareLineChartData(data, config, chartData) {
    if (Array.isArray(data)) {
      chartData.data.labels = data.map(item => item[config.xField] || item.label || item.x);
      
      const datasets = config.datasets || [{ 
        label: config.label || 'Data',
        yField: config.yField || 'value'
      }];

      chartData.data.datasets = datasets.map((dataset, index) => ({
        label: dataset.label,
        data: data.map(item => item[dataset.yField] || item.y || item.value),
        borderColor: dataset.borderColor || this.getColor(index),
        backgroundColor: config.type === 'area' 
          ? this.getColor(index, 0.2) 
          : dataset.backgroundColor || this.getColor(index, 0.1),
        fill: config.type === 'area',
        tension: dataset.tension || 0.4,
        pointRadius: dataset.pointRadius || 4,
        pointHoverRadius: dataset.pointHoverRadius || 6
      }));
    }

    return {
      success: true,
      chartData,
      library: 'chartjs',
      generator: 'ChartingService (FREE)'
    };
  }

  prepareBarChartData(data, config, chartData) {
    if (Array.isArray(data)) {
      chartData.data.labels = data.map(item => item[config.xField] || item.label || item.x);
      
      const datasets = config.datasets || [{ 
        label: config.label || 'Data',
        yField: config.yField || 'value'
      }];

      chartData.data.datasets = datasets.map((dataset, index) => ({
        label: dataset.label,
        data: data.map(item => item[dataset.yField] || item.y || item.value),
        backgroundColor: dataset.backgroundColor || this.getColor(index, 0.8),
        borderColor: dataset.borderColor || this.getColor(index),
        borderWidth: dataset.borderWidth || 1,
        borderRadius: dataset.borderRadius || 4,
        borderSkipped: false
      }));
    }

    return {
      success: true,
      chartData,
      library: 'chartjs',
      generator: 'ChartingService (FREE)'
    };
  }

  preparePieChartData(data, config, chartData) {
    if (Array.isArray(data)) {
      chartData.data.labels = data.map(item => item[config.labelField] || item.label || item.name);
      
      chartData.data.datasets = [{
        label: config.label || 'Data',
        data: data.map(item => item[config.valueField] || item.value || item.y),
        backgroundColor: data.map((_, index) => this.getColor(index, 0.8)),
        borderColor: data.map((_, index) => this.getColor(index)),
        borderWidth: 2,
        hoverOffset: 4
      }];
    }

    // Pie chart specific options
    chartData.options.plugins.legend.position = 'right';
    chartData.options.cutout = config.type === 'doughnut' ? '50%' : '0%';

    return {
      success: true,
      chartData,
      library: 'chartjs',
      generator: 'ChartingService (FREE)'
    };
  }

  prepareScatterChartData(data, config, chartData) {
    if (Array.isArray(data)) {
      const datasets = config.datasets || [{ 
        label: config.label || 'Data',
        xField: config.xField || 'x',
        yField: config.yField || 'y',
        sizeField: config.sizeField // For bubble charts
      }];

      chartData.data.datasets = datasets.map((dataset, index) => ({
        label: dataset.label,
        data: data.map(item => ({
          x: item[dataset.xField],
          y: item[dataset.yField],
          r: config.type === 'bubble' ? item[dataset.sizeField] || 5 : undefined
        })),
        backgroundColor: this.getColor(index, 0.6),
        borderColor: this.getColor(index),
        borderWidth: 2,
        pointRadius: config.type === 'bubble' ? undefined : 6
      }));
    }

    return {
      success: true,
      chartData,
      library: 'chartjs',
      generator: 'ChartingService (FREE)'
    };
  }

  prepareRadarChartData(data, config, chartData) {
    if (Array.isArray(data) && data.length > 0) {
      chartData.data.labels = Object.keys(data[0]).filter(key => 
        key !== config.labelField && key !== 'label' && key !== 'name'
      );
      
      chartData.data.datasets = data.map((item, index) => ({
        label: item[config.labelField] || item.label || item.name || `Dataset ${index + 1}`,
        data: chartData.data.labels.map(label => item[label] || 0),
        backgroundColor: this.getColor(index, 0.2),
        borderColor: this.getColor(index),
        borderWidth: 2,
        pointBackgroundColor: this.getColor(index),
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: this.getColor(index)
      }));
    }

    return {
      success: true,
      chartData,
      library: 'chartjs',
      generator: 'ChartingService (FREE)'
    };
  }

  prepareMixedChartData(data, config, chartData) {
    // Mixed chart with different chart types for different datasets
    if (Array.isArray(data)) {
      chartData.data.labels = data.map(item => item[config.xField] || item.label || item.x);
      
      chartData.data.datasets = config.datasets.map((dataset, index) => ({
        type: dataset.type || 'line',
        label: dataset.label,
        data: data.map(item => item[dataset.yField] || item.y || item.value),
        backgroundColor: dataset.type === 'bar' 
          ? this.getColor(index, 0.8) 
          : this.getColor(index, 0.2),
        borderColor: this.getColor(index),
        borderWidth: 2,
        fill: dataset.fill || false,
        yAxisID: dataset.yAxisID || 'y'
      }));
    }

    return {
      success: true,
      chartData,
      library: 'chartjs',
      generator: 'ChartingService (FREE)'
    };
  }

  // Plotly.js specific data preparation methods
  preparePlotlyLineData(data, config) {
    const traces = config.datasets || [{ 
      label: config.label || 'Data',
      yField: config.yField || 'value'
    }];

    return traces.map((dataset, index) => ({
      x: data.map(item => item[config.xField] || item.x),
      y: data.map(item => item[dataset.yField] || item.y),
      type: 'scatter',
      mode: 'lines+markers',
      name: dataset.label,
      line: { color: this.getColor(index) },
      marker: { color: this.getColor(index) }
    }));
  }

  preparePlotlyBarData(data, config) {
    return [{
      x: data.map(item => item[config.xField] || item.x),
      y: data.map(item => item[config.yField] || item.y),
      type: 'bar',
      name: config.label || 'Data',
      marker: { color: this.getColor(0, 0.8) }
    }];
  }

  preparePlotlyPieData(data, config) {
    return [{
      labels: data.map(item => item[config.labelField] || item.label),
      values: data.map(item => item[config.valueField] || item.value),
      type: 'pie',
      name: config.label || 'Data',
      marker: {
        colors: data.map((_, index) => this.getColor(index, 0.8))
      }
    }];
  }

  preparePlotlyScatterData(data, config) {
    return [{
      x: data.map(item => item[config.xField] || item.x),
      y: data.map(item => item[config.yField] || item.y),
      type: 'scatter',
      mode: 'markers',
      name: config.label || 'Data',
      marker: { 
        color: this.getColor(0, 0.8),
        size: config.sizeField ? data.map(item => item[config.sizeField]) : 8
      }
    }];
  }

  preparePlotlyHeatmapData(data, config) {
    return [{
      z: data,
      type: 'heatmap',
      colorscale: config.colorscale || 'Viridis',
      showscale: true
    }];
  }

  // Utility methods
  getScalesConfig(chartType, customScales = {}) {
    const baseScales = {
      x: {
        display: true,
        grid: { display: true, color: 'rgba(0,0,0,0.1)' },
        ticks: { maxRotation: 45 }
      },
      y: {
        display: true,
        grid: { display: true, color: 'rgba(0,0,0,0.1)' },
        beginAtZero: true
      }
    };

    // Chart type specific scale configurations
    if (chartType === 'pie' || chartType === 'doughnut' || chartType === 'radar') {
      return {}; // These chart types don't use scales
    }

    return { ...baseScales, ...customScales };
  }

  getColor(index, alpha = 1) {
    const colors = [
      `rgba(59, 130, 246, ${alpha})`,   // Blue
      `rgba(16, 185, 129, ${alpha})`,   // Green
      `rgba(245, 101, 101, ${alpha})`,  // Red
      `rgba(251, 191, 36, ${alpha})`,   // Yellow
      `rgba(139, 92, 246, ${alpha})`,   // Purple
      `rgba(236, 72, 153, ${alpha})`,   // Pink
      `rgba(6, 182, 212, ${alpha})`,    // Cyan
      `rgba(251, 146, 60, ${alpha})`,   // Orange
      `rgba(34, 197, 94, ${alpha})`,    // Lime
      `rgba(168, 85, 247, ${alpha})`    // Violet
    ];

    return colors[index % colors.length];
  }

  // Generate dashboard configuration for common dental store charts
  generateDashboardCharts(analyticsData) {
    const charts = [];

    // Revenue trend chart
    if (analyticsData.revenue && analyticsData.revenue.daily_data) {
      charts.push({
        id: 'revenue-trend',
        title: 'Revenue Trend',
        type: 'line',
        library: 'chartjs',
        data: analyticsData.revenue.daily_data,
        config: {
          type: 'line',
          xField: 'date',
          yField: 'revenue',
          label: 'Daily Revenue',
          title: 'Revenue Trend Over Time'
        }
      });
    }

    // Top products chart
    if (analyticsData.products && analyticsData.products.top_products) {
      charts.push({
        id: 'top-products',
        title: 'Top Products',
        type: 'bar',
        library: 'chartjs',
        data: analyticsData.products.top_products.slice(0, 10),
        config: {
          type: 'bar',
          xField: 'product_name',
          yField: 'total_revenue',
          label: 'Revenue',
          title: 'Top 10 Products by Revenue'
        }
      });
    }

    // Customer segments pie chart
    if (analyticsData.customers && analyticsData.customers.segments) {
      const segmentData = Object.entries(analyticsData.customers.segments).map(([segment, count]) => ({
        label: segment,
        value: count
      }));

      charts.push({
        id: 'customer-segments',
        title: 'Customer Segments',
        type: 'pie',
        library: 'chartjs',
        data: segmentData,
        config: {
          type: 'pie',
          labelField: 'label',
          valueField: 'value',
          title: 'Customer Segments Distribution'
        }
      });
    }

    // Geographic distribution
    if (analyticsData.geographic && analyticsData.geographic.top_locations) {
      charts.push({
        id: 'geographic-distribution',
        title: 'Geographic Distribution',
        type: 'bar',
        library: 'chartjs',
        data: analyticsData.geographic.top_locations.slice(0, 8),
        config: {
          type: 'bar',
          xField: 'city',
          yField: 'revenue',
          label: 'Revenue by City',
          title: 'Revenue Distribution by City'
        }
      });
    }

    return {
      success: true,
      charts,
      generator: 'ChartingService (FREE)',
      libraries_supported: ['chartjs', 'recharts', 'plotly']
    };
  }

  // Get service status
  getServiceStatus() {
    return {
      configured: this.isConfigured,
      supported_libraries: ['Chart.js', 'Recharts', 'Plotly.js'],
      supported_chart_types: this.supportedChartTypes,
      cost_per_chart: 0, // FREE
      features: [
        'multiple_chart_libraries',
        'custom_styling',
        'interactive_charts',
        'responsive_design',
        'unlimited_charts'
      ],
      limitations: [
        'frontend_rendering_required',
        'no_server_side_image_generation'
      ]
    };
  }
}

// Export singleton instance
module.exports = new ChartingService();
